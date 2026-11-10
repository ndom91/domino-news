import { type Db, schema } from '@dn/db'
import { ID_PREFIX, newId } from '@dn/domain'
import type { StoryUpdateKind, StoryUpdateOrigin, StoryUpdatesResponse } from '@dn/schemas'
import { and, desc, eq, inArray, isNull, ne, or, type SQLWrapper, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { resolveStory } from './story-detail.ts'

export const GENERIC_SUMMARY_REVISION_DESCRIPTION =
  'The story summary was updated with the latest reporting.'

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
    origin: StoryUpdateOrigin
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
  const story = await resolveStory(db, idOrSlug)
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
  const storyIds = db
    .select({ id: schema.narrativeStory.storyId })
    .from(schema.narrativeStory)
    .where(
      and(
        eq(schema.narrativeStory.narrativeId, narrative.id),
        isNull(schema.narrativeStory.removedAt),
      ),
    )
  return { items: await loadUpdates(db, storyIds, limit) }
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
        readerVisibleUpdate(),
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

const previousVersion = alias(schema.storySummaryVersion, 'previous_version')

async function loadUpdates(
  db: Db,
  // Story ids, or a subquery that selects them.
  storyIds: string[] | SQLWrapper,
  limit: number,
): Promise<StoryUpdatesResponse['items']> {
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
        readerVisibleUpdate(),
      ),
    )
    .orderBy(desc(schema.storyUpdateEvent.createdAt))
    .limit(limit)
  const visibleEvents = coalesceSummaryRevisions(events)
  if (visibleEvents.length === 0) return []
  const eventIds = visibleEvents.map((event) => event.id)
  const summaryVersionIds = visibleEvents.flatMap((event) =>
    event.summaryVersionId ? [event.summaryVersionId] : [],
  )
  const [sources, summaries] = await Promise.all([
    // Each source is an article or a primary source: one side of the left joins is empty.
    db
      .select({
        eventId: schema.storyUpdateEventSource.eventId,
        articleTitle: schema.articleRevision.title,
        articleDescription: schema.articleRevision.description,
        articleUrl: schema.article.canonicalUrl,
        publisher: {
          id: schema.publisher.id,
          slug: schema.publisher.slug,
          name: schema.publisher.name,
          domain: schema.publisher.domain,
        },
        referenceTitle: schema.sourceReference.title,
        referenceUrl: schema.sourceReference.url,
      })
      .from(schema.storyUpdateEventSource)
      .leftJoin(schema.article, eq(schema.article.id, schema.storyUpdateEventSource.articleId))
      .leftJoin(
        schema.articleRevision,
        eq(schema.articleRevision.id, schema.article.latestRevisionId),
      )
      .leftJoin(schema.publisher, eq(schema.publisher.id, schema.article.publisherId))
      .leftJoin(
        schema.sourceReference,
        eq(schema.sourceReference.id, schema.storyUpdateEventSource.sourceReferenceId),
      )
      .where(inArray(schema.storyUpdateEventSource.eventId, eventIds))
      // A stable order (ids start with their creation time), so grouped updates name
      // their publishers the same way on every request.
      .orderBy(schema.storyUpdateEventSource.id),
    summaryVersionIds.length
      ? db
          .select({
            id: schema.storySummaryVersion.id,
            body: schema.storySummaryVersion.body,
            previous: previousVersion.body,
          })
          .from(schema.storySummaryVersion)
          .leftJoin(
            previousVersion,
            eq(previousVersion.id, schema.storySummaryVersion.supersedesVersionId),
          )
          .where(inArray(schema.storySummaryVersion.id, summaryVersionIds))
      : Promise.resolve([]),
  ])
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]))
  const updates = visibleEvents.map((event) => {
    const summary = event.summaryVersionId ? summaryById.get(event.summaryVersionId) : undefined
    const eventSources = sources.filter((source) => source.eventId === event.id)
    return {
      id: event.id,
      storyId: event.storyId,
      kind: event.kind,
      description: event.description,
      origin: event.origin,
      createdAt: iso(event.createdAt),
      relatedStory: event.relatedStoryId
        ? {
            id: event.relatedStoryId,
            slug: event.relatedSlug ?? '',
            title: event.relatedTitle ?? '',
          }
        : null,
      summaryDiff: summary ? { previous: summary.previous, current: summary.body } : null,
      sources: [
        ...eventSources.flatMap(({ articleTitle, articleDescription, articleUrl, publisher }) =>
          articleTitle !== null && articleUrl !== null && publisher
            ? [
                {
                  type: 'article' as const,
                  title: articleTitle,
                  description: articleDescription,
                  url: articleUrl,
                  publisher,
                },
              ]
            : [],
        ),
        ...eventSources.flatMap(({ referenceTitle, referenceUrl }) =>
          referenceUrl !== null
            ? [
                {
                  type: 'primary_source' as const,
                  title: referenceTitle ?? 'Primary source',
                  description: null,
                  url: referenceUrl,
                  publisher: null,
                },
              ]
            : [],
        ),
      ],
    }
  })
  return coalesceNewReporting(updates)
}

function readerVisibleUpdate() {
  return or(
    ne(schema.storyUpdateEvent.kind, 'summary_revision'),
    ne(schema.storyUpdateEvent.origin, 'system'),
    ne(schema.storyUpdateEvent.description, GENERIC_SUMMARY_REVISION_DESCRIPTION),
  )
}

function coalesceSummaryRevisions<
  T extends { kind: StoryUpdateKind; summaryVersionId: string | null },
>(events: T[]) {
  const versions = new Set<string>()
  const out: T[] = []
  for (const event of events) {
    if (event.kind !== 'summary_revision' || !event.summaryVersionId) {
      out.push(event)
      continue
    }
    if (versions.has(event.summaryVersionId)) continue
    versions.add(event.summaryVersionId)
    out.push(event)
  }
  return out
}

function coalesceNewReporting(events: StoryUpdatesResponse['items']) {
  const out: StoryUpdatesResponse['items'] = []
  for (let index = 0; index < events.length; ) {
    const first = events[index]
    if (first?.kind !== 'new_reporting') {
      if (first) out.push(first)
      index++
      continue
    }
    let end = index + 1
    while (events[end]?.kind === 'new_reporting' && events[end]?.storyId === first.storyId) end++
    const group = events.slice(index, end)
    if (group.length === 1) {
      out.push(first)
      index = end
      continue
    }
    const sources = uniqueSources(group.flatMap((event) => event.sources))
    const publishers = [
      ...new Set(sources.flatMap((source) => (source.publisher ? [source.publisher.name] : []))),
    ]
    out.push({
      ...first,
      description: publishers.length
        ? `Additional reporting from ${formatList(publishers)}.`
        : 'Additional reporting was added.',
      sources,
    })
    index = end
  }
  return out
}

function uniqueSources(sources: StoryUpdatesResponse['items'][number]['sources']) {
  const byUrl = new Map<string, (typeof sources)[number]>()
  for (const source of sources) byUrl.set(source.url, source)
  return [...byUrl.values()]
}

function formatList(values: string[]) {
  if (values.length < 2) return values[0] ?? ''
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
}
