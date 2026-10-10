import { type Db, schema } from '@dn/db'
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { AggregateType } from '../outbox.ts'
import { ALIASES, type Alias, createCollection, pointAlias, type Typesense } from './typesense.ts'

const seconds = (d: Date | null) => (d ? Math.floor(d.getTime() / 1000) : 0)

// Search documents are pure functions of current Postgres state. Because the indexer
// always re-reads canonical state, replayed or out-of-order events converge on the same result.

async function storyDocument(db: Db, storyId: string) {
  const [story] = await db.select().from(schema.story).where(eq(schema.story.id, storyId))
  if (!story || !story.publishedAt || story.mergedIntoStoryId) return null
  const summary = story.currentSummaryId
    ? (
        await db
          .select()
          .from(schema.storySummaryVersion)
          .where(eq(schema.storySummaryVersion.id, story.currentSummaryId))
      )[0]
    : undefined
  const publishers = await db
    .selectDistinct({ id: schema.publisher.id, name: schema.publisher.name })
    .from(schema.storyArticle)
    .innerJoin(schema.article, eq(schema.article.id, schema.storyArticle.articleId))
    .innerJoin(schema.publisher, eq(schema.publisher.id, schema.article.publisherId))
    .where(and(eq(schema.storyArticle.storyId, storyId), isNull(schema.storyArticle.removedAt)))
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.storyArticle)
    .where(and(eq(schema.storyArticle.storyId, storyId), isNull(schema.storyArticle.removedAt)))
  const narratives = await db
    .select({ id: schema.narrativeStory.narrativeId })
    .from(schema.narrativeStory)
    .where(and(eq(schema.narrativeStory.storyId, storyId), isNull(schema.narrativeStory.removedAt)))
  return {
    version: story.version,
    doc: {
      id: story.id,
      slug: story.slug,
      title: story.title,
      summary: summary?.body,
      publisher_ids: publishers.map((p) => p.id),
      publisher_names: publishers.map((p) => p.name),
      narrative_ids: narratives.map((n) => n.id),
      source_count: count?.n ?? 0,
      last_updated_at: seconds(story.lastUpdatedAt),
      ...(story.embedding ? { embedding: story.embedding } : {}),
    },
  }
}

async function narrativeDocument(db: Db, narrativeId: string) {
  const [narrative] = await db
    .select()
    .from(schema.narrative)
    .where(eq(schema.narrative.id, narrativeId))
  if (!narrative) return null
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.narrativeStory)
    .innerJoin(schema.story, eq(schema.story.id, schema.narrativeStory.storyId))
    .where(
      and(
        eq(schema.narrativeStory.narrativeId, narrativeId),
        isNull(schema.narrativeStory.removedAt),
        isNotNull(schema.story.publishedAt),
      ),
    )
  if (!count || count.n === 0) return null
  return {
    version: narrative.version,
    doc: {
      id: narrative.id,
      slug: narrative.slug,
      title: narrative.title,
      description: narrative.description ?? undefined,
      story_count: count.n,
      updated_at: seconds(narrative.updatedAt),
    },
  }
}

async function articleDocument(db: Db, articleId: string) {
  const [row] = await db
    .select({
      id: schema.article.id,
      publisherId: schema.article.publisherId,
      publishedAt: schema.article.publishedAt,
      firstSeenAt: schema.article.firstSeenAt,
      title: schema.articleRevision.title,
      description: schema.articleRevision.description,
      embedding: schema.articleEmbedding.embedding,
    })
    .from(schema.article)
    .innerJoin(
      schema.articleRevision,
      eq(schema.articleRevision.id, schema.article.latestRevisionId),
    )
    .innerJoin(schema.articleEmbedding, eq(schema.articleEmbedding.articleId, schema.article.id))
    .where(eq(schema.article.id, articleId))
  if (!row) return null
  return {
    version: null,
    doc: {
      id: row.id,
      title: row.title,
      description: row.description ?? undefined,
      publisher_id: row.publisherId,
      published_at: seconds(row.publishedAt ?? row.firstSeenAt),
      embedding: row.embedding,
    },
  }
}

const ALIAS_FOR: Record<AggregateType, Alias> = {
  story: 'stories',
  narrative: 'narratives',
  article: 'articles',
}

function buildDocument(db: Db, type: AggregateType, id: string) {
  if (type === 'story') return storyDocument(db, id)
  if (type === 'narrative') return narrativeDocument(db, id)
  return articleDocument(db, id)
}

/**
 * Bring one aggregate's search document in line with Postgres. Idempotent.
 * `collection` overrides the alias during a rebuild.
 */
export async function projectAggregate(
  db: Db,
  ts: Typesense,
  type: AggregateType,
  id: string,
  collection: string = ALIAS_FOR[type],
) {
  const built = await buildDocument(db, type, id)
  if (built) await ts.upsert(collection, built.doc)
  else await ts.remove(collection, id)
  await db
    .insert(schema.searchProjectionState)
    .values({
      aggregateType: type,
      aggregateId: id,
      indexedVersion: built?.version ?? 0,
      deleted: !built,
    })
    .onConflictDoUpdate({
      target: [
        schema.searchProjectionState.aggregateType,
        schema.searchProjectionState.aggregateId,
      ],
      set: {
        indexedVersion: sql`greatest(${schema.searchProjectionState.indexedVersion}, excluded.indexed_version)`,
        deleted: !built,
        updatedAt: new Date(),
      },
    })
}

const INDEXER = 'typesense-indexer'
const MAX_ATTEMPTS = 8

/**
 * Process one batch of outbox events. At-least-once: an event is marked processed only
 * after the projection succeeded; failures back off exponentially and dead-letter after
 * MAX_ATTEMPTS (still visible on the ops page and replayable).
 */
export async function processOutboxBatch(db: Db, ts: Typesense, limit = 50) {
  return db.transaction(async (tx) => {
    const events = await tx
      .select()
      .from(schema.outboxEvent)
      .where(
        and(
          isNull(schema.outboxEvent.processedAt),
          isNull(schema.outboxEvent.deadAt),
          sql`${schema.outboxEvent.nextAttemptAt} <= now()`,
        ),
      )
      .orderBy(asc(schema.outboxEvent.id))
      .limit(limit)
      .for('update', { skipLocked: true })
    let processed = 0
    let failed = 0
    // Collapse duplicates within the batch: projecting current state once covers them all.
    const done = new Map<string, string | null>()
    for (const event of events) {
      const key = `${event.aggregateType}:${event.aggregateId}`
      if (!done.has(key)) {
        try {
          const [state] = await tx
            .select()
            .from(schema.searchProjectionState)
            .where(
              and(
                eq(schema.searchProjectionState.aggregateType, event.aggregateType),
                eq(schema.searchProjectionState.aggregateId, event.aggregateId),
              ),
            )
          const alreadyApplied =
            event.aggregateType !== 'article' &&
            state !== undefined &&
            !state.deleted &&
            state.indexedVersion > event.aggregateVersion
          if (!alreadyApplied) {
            await projectAggregate(tx, ts, event.aggregateType as AggregateType, event.aggregateId)
          }
          done.set(key, null)
        } catch (error) {
          done.set(key, String(error).slice(0, 500))
        }
      }
      const error = done.get(key)
      if (error) {
        failed++
        const attempts = event.attempts + 1
        await tx
          .update(schema.outboxEvent)
          .set({
            attempts,
            lastError: error,
            nextAttemptAt: new Date(Date.now() + Math.min(2 ** attempts, 600) * 1000),
            deadAt: attempts >= MAX_ATTEMPTS ? new Date() : null,
          })
          .where(eq(schema.outboxEvent.id, event.id))
      } else {
        processed++
        await tx
          .update(schema.outboxEvent)
          .set({ processedAt: new Date(), lastError: null })
          .where(eq(schema.outboxEvent.id, event.id))
        await tx
          .insert(schema.inboxEvent)
          .values({ consumer: INDEXER, eventId: String(event.id) })
          .onConflictDoNothing()
      }
    }
    return { processed, failed, fetched: events.length }
  })
}

/**
 * Rebuild every search collection from Postgres into fresh collections, then swap aliases.
 * The live index keeps serving until the swap.
 */
export async function rebuildSearchIndex(db: Db, ts: Typesense, log = console.log) {
  for (const alias of ALIASES) {
    const collection = await createCollection(ts, alias)
    const ids =
      alias === 'stories'
        ? await db
            .select({ id: schema.story.id })
            .from(schema.story)
            .where(isNotNull(schema.story.publishedAt))
        : alias === 'narratives'
          ? await db.select({ id: schema.narrative.id }).from(schema.narrative)
          : await db.select({ id: schema.articleEmbedding.articleId }).from(schema.articleEmbedding)
    const type: AggregateType =
      alias === 'stories' ? 'story' : alias === 'narratives' ? 'narrative' : 'article'
    for (const { id } of ids) await projectAggregate(db, ts, type, id, collection)
    const previous = await pointAlias(ts, alias, collection)
    if (previous && previous !== collection) {
      await ts.request('DELETE', `/collections/${previous}`).catch(() => {})
    }
    log(`rebuilt ${alias}: ${ids.length} aggregates -> ${collection}`)
  }
}

export async function pendingOutboxCount(db: Db) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.outboxEvent)
    .where(and(isNull(schema.outboxEvent.processedAt), isNull(schema.outboxEvent.deadAt)))
  return row?.n ?? 0
}
