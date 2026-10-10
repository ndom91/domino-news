import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { schema, withTransaction } from '@dn/db'
import { ID_PREFIX, newId } from '@dn/domain'
import type { ArticleMetadata } from '@dn/schemas'
import { analysisJob, QUEUES, sha256 } from '@dn/server'
import { eq } from 'drizzle-orm'
import { sendInTx, type WorkerContext } from './context.ts'
import { parseFeed } from './rss.ts'

export type FixtureVariant = 'rss' | 'rss-update'

interface FetchResult {
  xml: string | null
  etag?: string | null
  lastModified?: string | null
}

async function fetchFeedXml(
  ctx: WorkerContext,
  feed: typeof schema.feed.$inferSelect,
  publisherSlug: string,
  variant: FixtureVariant,
): Promise<FetchResult> {
  if (ctx.config.ingestMode === 'fixture') {
    const file = path.resolve(ctx.config.fixtureDir, variant, `${publisherSlug}.xml`)
    try {
      return { xml: await readFile(file, 'utf8') }
    } catch {
      return { xml: null } // No fixture for this publisher/variant.
    }
  }
  const res = await fetch(feed.url, {
    headers: {
      'user-agent': 'DominoNewsPrototype/0.1 (RSS metadata reader)',
      accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
      ...(feed.etag ? { 'if-none-match': feed.etag } : {}),
      ...(feed.lastModified ? { 'if-modified-since': feed.lastModified } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  })
  if (res.status === 304) return { xml: null, etag: feed.etag, lastModified: feed.lastModified }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return {
    xml: await res.text(),
    etag: res.headers.get('etag'),
    lastModified: res.headers.get('last-modified'),
  }
}

/**
 * Items published longer ago than `maxAgeDays` are archive content, not news (some feeds
 * return years of history). Undated items count as new.
 */
export function isStaleItem(publishedAt: string | null, now: Date, maxAgeDays: number) {
  if (!publishedAt) return false
  return now.getTime() - new Date(publishedAt).getTime() > maxAgeDays * 24 * 3_600_000
}

function priorityClassFor(ctx: WorkerContext, item: ArticleMetadata, now: Date) {
  if (!item.publishedAt) return 'fresh' as const
  const ageHours = (now.getTime() - new Date(item.publishedAt).getTime()) / 3_600_000
  return ageHours > ctx.config.freshWindowHours ? ('backfill' as const) : ('fresh' as const)
}

/**
 * Upsert one feed item. Each item runs in its own transaction so a bad item cannot
 * poison the rest of the feed. Returns what changed.
 */
async function ingestItem(
  ctx: WorkerContext,
  feed: typeof schema.feed.$inferSelect,
  item: ArticleMetadata,
  now: Date,
) {
  return withTransaction(ctx.pool, async (tx) => {
    const { db } = tx
    const cls = priorityClassFor(ctx, item, now)
    const inserted = await db
      .insert(schema.article)
      .values({
        id: newId(ID_PREFIX.article),
        publisherId: feed.publisherId,
        canonicalUrl: item.canonicalUrl,
        firstSeenAt: now,
        publishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
        pipelineState: cls === 'backfill' ? 'pending_backfill' : 'queued',
      })
      .onConflictDoNothing({ target: schema.article.canonicalUrl })
      .returning()
    const isNew = inserted.length > 0
    const [article] = isNew
      ? inserted
      : await db
          .select()
          .from(schema.article)
          .where(eq(schema.article.canonicalUrl, item.canonicalUrl))
          .for('update')
    if (!article) throw new Error('article upsert failed')

    await db
      .insert(schema.feedEntry)
      .values({
        id: newId(ID_PREFIX.feedEntry),
        feedId: feed.id,
        articleId: article.id,
        externalGuid: item.externalGuid,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [schema.feedEntry.feedId, schema.feedEntry.articleId],
        set: { lastSeenAt: now },
      })

    const contentHash = sha256(`${item.title}\n${item.description ?? ''}`)
    const [latest] = article.latestRevisionId
      ? await db
          .select()
          .from(schema.articleRevision)
          .where(eq(schema.articleRevision.id, article.latestRevisionId))
      : []
    if (latest?.contentHash === contentHash) return { created: false, revised: false }

    const revisionId = newId(ID_PREFIX.articleRevision)
    await db.insert(schema.articleRevision).values({
      id: revisionId,
      articleId: article.id,
      observedAt: now,
      reportedUpdatedAt: item.updatedAt ? new Date(item.updatedAt) : null,
      title: item.title,
      description: item.description,
      contentHash,
      previousRevisionId: latest?.id ?? null,
    })
    // Re-processing a revised article that was already in the pipeline counts as fresh work.
    const pipelineState =
      article.pipelineState === 'pending_backfill' ? 'pending_backfill' : 'queued'
    await db
      .update(schema.article)
      .set({ latestRevisionId: revisionId, pipelineState })
      .where(eq(schema.article.id, article.id))
    await db.insert(schema.observation).values({
      id: newId(ID_PREFIX.observation),
      type: latest ? 'article_revision_detected' : 'article_discovered',
      observedAt: now,
      sourcePublishedAt: item.publishedAt ? new Date(item.publishedAt) : null,
      sourceUrl: item.canonicalUrl,
      collectionMethod: 'rss',
      subjectType: 'article',
      subjectId: article.id,
      payload: {
        feedId: feed.id,
        revisionId,
        title: item.title,
        description: item.description,
        externalGuid: item.externalGuid,
        previousRevisionId: latest?.id ?? null,
      },
      schemaVersion: 1,
    })

    if (pipelineState === 'queued') {
      const job = analysisJob(article.id, revisionId, latest ? 'fresh' : cls)
      await sendInTx(ctx, tx, QUEUES.embedArticle, job.data, job.options)
    }
    return { created: isNew, revised: !isNew }
  })
}

export async function pollFeed(
  ctx: WorkerContext,
  feedId: string,
  variant: FixtureVariant = 'rss',
) {
  const [row] = await ctx.db
    .select({ feed: schema.feed, publisherSlug: schema.publisher.slug })
    .from(schema.feed)
    .innerJoin(schema.publisher, eq(schema.publisher.id, schema.feed.publisherId))
    .where(eq(schema.feed.id, feedId))
  if (!row?.feed.enabled) return { skipped: true }
  const { feed, publisherSlug } = row
  const now = new Date()
  try {
    const fetched = await fetchFeedXml(ctx, feed, publisherSlug, variant)
    const { items, skipped } = fetched.xml ? parseFeed(fetched.xml) : { items: [], skipped: 0 }
    let created = 0
    let revised = 0
    let failed = 0
    let stale = 0
    for (const item of items) {
      // Fixture feeds are frozen captures, so the age cutoff only applies to live feeds.
      if (
        ctx.config.ingestMode === 'live' &&
        isStaleItem(item.publishedAt, now, ctx.config.maxArticleAgeDays)
      ) {
        stale++
        continue
      }
      try {
        const result = await ingestItem(ctx, feed, item, now)
        if (result.created) created++
        if (result.revised) revised++
      } catch (error) {
        failed++
        console.error(
          `[ingest] item failed feed=${feed.id} url=${item.canonicalUrl}`,
          String(error),
        )
      }
    }
    await ctx.db
      .update(schema.feed)
      .set({
        lastPolledAt: now,
        lastStatus: failed > 0 ? 'partial' : 'ok',
        lastError: failed > 0 ? `${failed} item(s) failed, ${skipped} invalid` : null,
        etag: fetched.etag ?? feed.etag,
        lastModified: fetched.lastModified ?? feed.lastModified,
      })
      .where(eq(schema.feed.id, feed.id))
    return { items: items.length, created, revised, skipped, stale, failed }
  } catch (error) {
    // Feed errors are isolated: record and move on; the next scheduled poll retries.
    const message = String(error).slice(0, 300)
    await ctx.db
      .update(schema.feed)
      .set({
        lastPolledAt: now,
        lastStatus: 'error',
        lastError: message,
      })
      .where(eq(schema.feed.id, feed.id))
    return { error: message }
  }
}
