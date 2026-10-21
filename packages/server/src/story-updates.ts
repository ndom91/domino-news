import { type Db, schema } from '@dn/db'
import { ID_PREFIX, newId } from '@dn/domain'
import type { StoryUpdateKind, StoryUpdatesResponse } from '@dn/schemas'
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'

/**
 * Records a reader-visible change alongside its exact Story-local source targets. Callers must
 * already have validated the targets; this stays separate from outbox delivery bookkeeping.
 */
export async function recordStoryUpdate(
  db: Db,
  input: {
    storyId: string
    kind: StoryUpdateKind
    description: string
    origin: 'system' | 'model' | 'editor'
    articleIds?: string[]
    sourceReferenceIds?: string[]
    summaryVersionId?: string
    relatedStoryId?: string
    analysisRunId?: string
  },
) {
  const id = newId(ID_PREFIX.storyUpdateEvent)
  await db.insert(schema.storyUpdateEvent).values({
    id,
    storyId: input.storyId,
    kind: input.kind,
    description: input.description,
    origin: input.origin,
    summaryVersionId: input.summaryVersionId,
    relatedStoryId: input.relatedStoryId,
    analysisRunId: input.analysisRunId,
  })
  const sources = [
    ...(input.articleIds ?? []).map((articleId) => ({
      id: newId(ID_PREFIX.storyUpdateEventSource),
      eventId: id,
      articleId,
    })),
    ...(input.sourceReferenceIds ?? []).map((sourceReferenceId) => ({
      id: newId(ID_PREFIX.storyUpdateEventSource),
      eventId: id,
      sourceReferenceId,
    })),
  ]
  if (sources.length) await db.insert(schema.storyUpdateEventSource).values(sources)
  return id
}

const iso = (date: Date) => date.toISOString()

/** Bounded, source-resolved event timeline for a published Story. */
export async function listStoryUpdates(
  db: Db,
  idOrSlug: string,
  limit = 20,
): Promise<StoryUpdatesResponse | null> {
  const [story] = await db
    .select({ id: schema.story.id })
    .from(schema.story)
    .where(or(eq(schema.story.id, idOrSlug), eq(schema.story.slug, idOrSlug)))
  if (!story) return null
  return { items: await loadUpdates(db, [story.id], limit) }
}

/** Recent source-resolved events across the active Stories in a Narrative. */
export async function listNarrativeUpdates(
  db: Db,
  idOrSlug: string,
  limit = 20,
): Promise<StoryUpdatesResponse | null> {
  const [narrative] = await db
    .select({ id: schema.narrative.id })
    .from(schema.narrative)
    .where(or(eq(schema.narrative.id, idOrSlug), eq(schema.narrative.slug, idOrSlug)))
  if (!narrative) return null
  const stories = await db
    .select({ id: schema.narrativeStory.storyId })
    .from(schema.narrativeStory)
    .where(
      and(
        eq(schema.narrativeStory.narrativeId, narrative.id),
        isNull(schema.narrativeStory.removedAt),
      ),
    )
  return {
    items: await loadUpdates(
      db,
      stories.map((story) => story.id),
      limit,
    ),
  }
}

/** Latest reader-visible, non-superseded event for each candidate Story after a checkpoint. */
export async function latestStoryUpdatesSince(
  db: Db,
  storyIds: string[],
  since: Date,
): Promise<Map<string, { kind: StoryUpdateKind; description: string }>> {
  if (storyIds.length === 0) return new Map()
  const rows = await db
    .select({
      storyId: schema.storyUpdateEvent.storyId,
      kind: schema.storyUpdateEvent.kind,
      description: schema.storyUpdateEvent.description,
    })
    .from(schema.storyUpdateEvent)
    .where(
      and(
        inArray(schema.storyUpdateEvent.storyId, storyIds),
        isNull(schema.storyUpdateEvent.supersededAt),
        // The checkpoint is the previous successful Briefing open, so equality belongs to the
        // earlier visit and must not be repeated.
        sql`${schema.storyUpdateEvent.createdAt} > ${since}`,
      ),
    )
    .orderBy(desc(schema.storyUpdateEvent.createdAt))
  const latest = new Map<string, { kind: StoryUpdateKind; description: string }>()
  for (const row of rows) {
    if (!latest.has(row.storyId)) latest.set(row.storyId, row)
  }
  return latest
}

async function loadUpdates(
  db: Db,
  storyIds: string[],
  limit: number,
): Promise<StoryUpdatesResponse['items']> {
  if (storyIds.length === 0) return []
  const events = await db
    .select({
      id: schema.storyUpdateEvent.id,
      storyId: schema.storyUpdateEvent.storyId,
      kind: schema.storyUpdateEvent.kind,
      description: schema.storyUpdateEvent.description,
      origin: schema.storyUpdateEvent.origin,
      createdAt: schema.storyUpdateEvent.createdAt,
      summaryVersionId: schema.storyUpdateEvent.summaryVersionId,
      relatedStoryId: schema.storyUpdateEvent.relatedStoryId,
      relatedSlug: schema.story.slug,
      relatedTitle: schema.story.title,
    })
    .from(schema.storyUpdateEvent)
    .leftJoin(schema.story, eq(schema.story.id, schema.storyUpdateEvent.relatedStoryId))
    .where(
      and(
        inArray(schema.storyUpdateEvent.storyId, storyIds),
        isNull(schema.storyUpdateEvent.supersededAt),
      ),
    )
    .orderBy(desc(schema.storyUpdateEvent.createdAt))
    .limit(limit)
  if (events.length === 0) return []
  const eventIds = events.map((event) => event.id)
  const summaryVersionIds = events.flatMap((event) =>
    event.summaryVersionId ? [event.summaryVersionId] : [],
  )
  const [articleSources, primarySources, summaries] = await Promise.all([
    db
      .select({
        eventId: schema.storyUpdateEventSource.eventId,
        title: schema.articleRevision.title,
        description: schema.articleRevision.description,
        url: schema.article.canonicalUrl,
        publisher: {
          id: schema.publisher.id,
          slug: schema.publisher.slug,
          name: schema.publisher.name,
          domain: schema.publisher.domain,
        },
      })
      .from(schema.storyUpdateEventSource)
      .innerJoin(schema.article, eq(schema.article.id, schema.storyUpdateEventSource.articleId))
      .innerJoin(
        schema.articleRevision,
        eq(schema.articleRevision.id, schema.article.latestRevisionId),
      )
      .innerJoin(schema.publisher, eq(schema.publisher.id, schema.article.publisherId))
      .where(inArray(schema.storyUpdateEventSource.eventId, eventIds)),
    db
      .select({
        eventId: schema.storyUpdateEventSource.eventId,
        title: schema.sourceReference.title,
        url: schema.sourceReference.url,
      })
      .from(schema.storyUpdateEventSource)
      .innerJoin(
        schema.sourceReference,
        eq(schema.sourceReference.id, schema.storyUpdateEventSource.sourceReferenceId),
      )
      .where(inArray(schema.storyUpdateEventSource.eventId, eventIds)),
    summaryVersionIds.length
      ? db
          .select({
            id: schema.storySummaryVersion.id,
            body: schema.storySummaryVersion.body,
            supersedesVersionId: schema.storySummaryVersion.supersedesVersionId,
          })
          .from(schema.storySummaryVersion)
          .where(inArray(schema.storySummaryVersion.id, summaryVersionIds))
      : Promise.resolve([]),
  ])
  const previousIds = summaries.flatMap((summary) =>
    summary.supersedesVersionId ? [summary.supersedesVersionId] : [],
  )
  const previous = previousIds.length
    ? await db
        .select({ id: schema.storySummaryVersion.id, body: schema.storySummaryVersion.body })
        .from(schema.storySummaryVersion)
        .where(inArray(schema.storySummaryVersion.id, previousIds))
    : []
  return events.map((event) => ({
    id: event.id,
    storyId: event.storyId,
    kind: event.kind,
    description: event.description,
    origin: event.origin,
    createdAt: iso(event.createdAt),
    relatedStory: event.relatedStoryId
      ? { id: event.relatedStoryId, slug: event.relatedSlug ?? '', title: event.relatedTitle ?? '' }
      : null,
    summaryDiff: event.summaryVersionId
      ? (() => {
          const current = summaries.find((summary) => summary.id === event.summaryVersionId)
          if (!current) return null
          return {
            previous:
              previous.find((summary) => summary.id === current.supersedesVersionId)?.body ?? null,
            current: current.body,
          }
        })()
      : null,
    sources: [
      ...articleSources
        .filter((source) => source.eventId === event.id)
        .map((source) => ({
          type: 'article' as const,
          title: source.title,
          description: source.description,
          url: source.url,
          publisher: source.publisher,
        })),
      ...primarySources
        .filter((source) => source.eventId === event.id)
        .map((source) => ({
          type: 'primary_source' as const,
          title: source.title ?? 'Primary source',
          description: null,
          url: source.url,
          publisher: null,
        })),
    ],
  }))
}
