import { type Db, schema } from '@dn/db'
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import type { AggregateType } from '../outbox.ts'
import { ALIASES, type Alias, createCollection, pointAlias, type Typesense } from './typesense.ts'

const seconds = (d: Date | null) => (d ? Math.floor(d.getTime() / 1000) : 0)

// Search documents are pure functions of current Postgres state. Because the indexer
// always re-reads canonical state, replayed or out-of-order events converge on the same result.

async function storyDocument(db: Db, storyId: string) {
  const [story] = await db.select().from(schema.story).where(eq(schema.story.id, storyId))
  if (!story?.publishedAt || story.mergedIntoStoryId) return null
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
  // Only searchable/filterable fields: results are hydrated from Postgres.
  return {
    version: story.version,
    doc: {
      id: story.id,
      title: story.title,
      summary: summary?.body,
      publisher_ids: publishers.map((p) => p.id),
      publisher_names: publishers.map((p) => p.name),
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
      title: narrative.title,
      description: narrative.description ?? undefined,
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
  await recordProjectionState(db, type, id, built)
}

async function recordProjectionState(
  db: Db,
  type: AggregateType,
  id: string,
  built: { version: number | null } | null,
) {
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
// A claimed event is retried by any indexer once its lease runs out (e.g. after a crash).
const LEASE_SECONDS = 60

type OutboxRow = typeof schema.outboxEvent.$inferSelect

/**
 * Process one batch of outbox events. At-least-once: an event is marked processed only
 * after the projection succeeded; failures back off exponentially and dead-letter after
 * MAX_ATTEMPTS (still visible on the ops page and replayable).
 *
 * Events are claimed with a short lease instead of a long transaction, so slow Typesense
 * calls never hold row locks or a pooled connection open.
 */
export async function processOutboxBatch(db: Db, ts: Typesense, limit = 50) {
  const claimed = await db.execute<{ id: number }>(sql`
    update ${schema.outboxEvent}
    set next_attempt_at = now() + make_interval(secs => ${LEASE_SECONDS})
    where id in (
      select id from ${schema.outboxEvent}
      where processed_at is null and dead_at is null and next_attempt_at <= now()
      order by id
      limit ${limit}
      for update skip locked
    )
    returning id`)
  const ids = claimed.rows.map((r) => Number(r.id))
  if (ids.length === 0) return { processed: 0, failed: 0, fetched: 0 }
  const events = await db
    .select()
    .from(schema.outboxEvent)
    .where(inArray(schema.outboxEvent.id, ids))
    .orderBy(asc(schema.outboxEvent.id))

  // Collapse duplicates within the batch: projecting current state once covers them all.
  const outcome = new Map<string, string | null>()
  for (const event of events) {
    const key = `${event.aggregateType}:${event.aggregateId}`
    if (!outcome.has(key)) outcome.set(key, await projectEvent(db, ts, event))
  }

  let processed = 0
  let failed = 0
  for (const event of events) {
    const error = outcome.get(`${event.aggregateType}:${event.aggregateId}`)
    if (error) {
      failed++
      const attempts = event.attempts + 1
      await db
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
      await db.transaction(async (tx) => {
        await tx
          .update(schema.outboxEvent)
          .set({ processedAt: new Date(), lastError: null })
          .where(eq(schema.outboxEvent.id, event.id))
        await tx
          .insert(schema.inboxEvent)
          .values({ consumer: INDEXER, eventId: String(event.id) })
          .onConflictDoNothing()
      })
    }
  }
  return { processed, failed, fetched: events.length }
}

/** Returns an error message, or null when the aggregate's document is current. */
async function projectEvent(db: Db, ts: Typesense, event: OutboxRow): Promise<string | null> {
  try {
    const [state] = await db
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
      await projectAggregate(db, ts, event.aggregateType as AggregateType, event.aggregateId)
    }
    return null
  } catch (error) {
    return String(error).slice(0, 500)
  }
}

/**
 * Rebuild every search collection from Postgres into fresh collections, then swap aliases.
 * The live index keeps serving until the swap.
 */
const REBUILD_BATCH = 100

export async function rebuildSearchIndex(db: Db, ts: Typesense, log = console.log) {
  const startedAt = new Date()
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
    // Build documents per aggregate, but send them to Typesense in bulk.
    for (let i = 0; i < ids.length; i += REBUILD_BATCH) {
      const batch = ids.slice(i, i + REBUILD_BATCH)
      const built = await Promise.all(batch.map(({ id }) => buildDocument(db, type, id)))
      await ts.importDocuments(
        collection,
        built.flatMap((b) => (b ? [b.doc] : [])),
      )
      for (const [j, { id }] of batch.entries()) {
        await recordProjectionState(db, type, id, built[j] ?? null)
      }
    }
    const previous = await pointAlias(ts, alias, collection)
    if (previous && previous !== collection) {
      await ts.request('DELETE', `/collections/${previous}`).catch(() => {})
    }
    log(`rebuilt ${alias}: ${ids.length} aggregates -> ${collection}`)
  }
  // The live indexer kept writing to the old collections during the rebuild; re-apply those.
  const touched = await db
    .selectDistinct({ type: schema.outboxEvent.aggregateType, id: schema.outboxEvent.aggregateId })
    .from(schema.outboxEvent)
    .where(sql`${schema.outboxEvent.processedAt} >= ${startedAt}`)
  for (const t of touched) await projectAggregate(db, ts, t.type as AggregateType, t.id)
}
