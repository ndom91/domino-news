import { type Db, schema } from '@dn/db'
import type {
  NarrativeRef,
  PublisherRef,
  Region,
  StoryListItem,
  StoryListResponse,
} from '@dn/schemas'
import {
  and,
  arrayContains,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  type SQLWrapper,
  sql,
} from 'drizzle-orm'
import { cached, SHARED_TTL_MS } from './cache.ts'

const iso = (d: Date) => d.toISOString()

// Reads never need the embedding (768 floats, ~9.5 KB per row as text).
const {
  embedding: _embedding,
  embeddingModelId: _embeddingModelId,
  embeddingSummaryId: _embeddingSummaryId,
  ...storyColumns
} = getTableColumns(schema.story)

export { storyColumns }

export async function publishersByStory(db: Db, storyIds: string[]) {
  const map = new Map<string, PublisherRef[]>()
  if (storyIds.length === 0) return map
  const rows = await db
    .selectDistinct({
      storyId: schema.storyArticle.storyId,
      id: schema.publisher.id,
      slug: schema.publisher.slug,
      name: schema.publisher.name,
      domain: schema.publisher.domain,
    })
    .from(schema.storyArticle)
    .innerJoin(schema.article, eq(schema.article.id, schema.storyArticle.articleId))
    .innerJoin(schema.publisher, eq(schema.publisher.id, schema.article.publisherId))
    .where(
      and(inArray(schema.storyArticle.storyId, storyIds), isNull(schema.storyArticle.removedAt)),
    )
  for (const { storyId, ...pub } of rows) {
    const list = map.get(storyId) ?? []
    list.push(pub)
    map.set(storyId, list)
  }
  return map
}

/**
 * Each Narrative's desk: the one most of its Stories share (ties: most recently updated), so
 * its colour is stable. A subquery to join on `narrativeId`, computed once per Narrative;
 * pass the ids (or a subquery of them) to limit the work, or omit them for all.
 */
export function narrativeDesks(db: Db, narrativeIds?: string[] | SQLWrapper) {
  return db
    .selectDistinctOn([schema.narrativeStory.narrativeId], {
      narrativeId: schema.narrativeStory.narrativeId,
      desk: schema.story.desk,
    })
    .from(schema.narrativeStory)
    .innerJoin(schema.story, eq(schema.story.id, schema.narrativeStory.storyId))
    .where(
      and(
        narrativeIds ? inArray(schema.narrativeStory.narrativeId, narrativeIds) : undefined,
        isNull(schema.narrativeStory.removedAt),
        isNotNull(schema.story.desk),
      ),
    )
    .groupBy(schema.narrativeStory.narrativeId, schema.story.desk)
    .orderBy(
      schema.narrativeStory.narrativeId,
      desc(sql`count(*)`),
      desc(sql`max(${schema.story.lastUpdatedAt})`),
    )
    .as('desks')
}

export async function narrativesByStory(db: Db, storyIds: string[]) {
  const map = new Map<string, NarrativeRef[]>()
  if (storyIds.length === 0) return map
  const active = and(
    inArray(schema.narrativeStory.storyId, storyIds),
    isNull(schema.narrativeStory.removedAt),
  )
  const desks = narrativeDesks(
    db,
    db.select({ id: schema.narrativeStory.narrativeId }).from(schema.narrativeStory).where(active),
  )
  const rows = await db
    .select({
      storyId: schema.narrativeStory.storyId,
      id: schema.narrative.id,
      slug: schema.narrative.slug,
      title: schema.narrative.title,
      desk: desks.desk,
    })
    .from(schema.narrativeStory)
    .innerJoin(schema.narrative, eq(schema.narrative.id, schema.narrativeStory.narrativeId))
    .leftJoin(desks, eq(desks.narrativeId, schema.narrative.id))
    .where(active)
  for (const { storyId, ...ref } of rows) {
    const list = map.get(storyId) ?? []
    list.push(ref)
    map.set(storyId, list)
  }
  return map
}

// List views only need the shape of coverage; the Story page shows every source.
const MAX_TRACE_PER_STORY = 20

async function tracesByStory(db: Db, storyIds: string[]) {
  const map = new Map<string, StoryListItem['trace']>()
  if (storyIds.length === 0) return map
  const reportedAt = sql`coalesce(${schema.article.publishedAt}, ${schema.article.firstSeenAt})`
  const ranked = db
    .select({
      storyId: schema.storyArticle.storyId,
      id: schema.article.id,
      publisherName: schema.publisher.name,
      publishedAt: schema.article.publishedAt,
      firstSeenAt: schema.article.firstSeenAt,
      citation: schema.storySummarySource.citation,
      cited: sql<boolean>`${schema.storySummarySource.articleId} is not null`.as('cited'),
      rank: sql<number>`row_number() over (partition by ${schema.storyArticle.storyId} order by ${reportedAt} desc)`.as(
        'rank',
      ),
    })
    .from(schema.storyArticle)
    .innerJoin(schema.article, eq(schema.article.id, schema.storyArticle.articleId))
    .innerJoin(schema.publisher, eq(schema.publisher.id, schema.article.publisherId))
    .innerJoin(schema.story, eq(schema.story.id, schema.storyArticle.storyId))
    .leftJoin(
      schema.storySummarySource,
      and(
        eq(schema.storySummarySource.summaryVersionId, schema.story.currentSummaryId),
        eq(schema.storySummarySource.articleId, schema.article.id),
      ),
    )
    .where(
      and(inArray(schema.storyArticle.storyId, storyIds), isNull(schema.storyArticle.removedAt)),
    )
    .as('ranked')
  const rows = await db.select().from(ranked).where(sql`${ranked.rank} <= ${MAX_TRACE_PER_STORY}`)
  for (const r of rows) {
    const list = map.get(r.storyId) ?? []
    list.push({
      id: r.id,
      publisherName: r.publisherName,
      at: iso(r.publishedAt ?? r.firstSeenAt),
      // Summaries from before numbered markers still count as cited, just without a number.
      citation: r.citation ?? (r.cited ? 0 : null),
    })
    map.set(r.storyId, list)
  }
  return map
}

// When a Story has several outgoing links, show the most specific one.
const RELATION_PRIORITY = [
  'corrects',
  'branches_from',
  'responds_to',
  'follows',
  'provides_context_for',
  'related_to',
]

async function relationsByStory(db: Db, storyIds: string[]) {
  const map = new Map<string, StoryListItem['relation']>()
  if (storyIds.length === 0) return map
  const rows = await db
    .select({
      storyId: schema.storyRelationship.fromStoryId,
      type: schema.storyRelationship.relation,
      slug: schema.story.slug,
      title: schema.story.title,
    })
    .from(schema.storyRelationship)
    .innerJoin(schema.story, eq(schema.story.id, schema.storyRelationship.toStoryId))
    .where(
      and(
        inArray(schema.storyRelationship.fromStoryId, storyIds),
        isNull(schema.storyRelationship.supersededAt),
        isNotNull(schema.story.publishedAt),
      ),
    )
  for (const { storyId, ...rel } of rows) {
    const current = map.get(storyId)
    if (!current || RELATION_PRIORITY.indexOf(rel.type) < RELATION_PRIORITY.indexOf(current.type)) {
      map.set(storyId, rel)
    }
  }
  return map
}

async function primarySourceByStory(db: Db, storyIds: string[]) {
  const map = new Map<string, StoryListItem['primarySource']>()
  if (storyIds.length === 0) return map
  const rows = await db
    .select({
      storyId: schema.storySourceReference.storyId,
      title: schema.sourceReference.title,
      url: schema.sourceReference.url,
    })
    .from(schema.storySourceReference)
    .innerJoin(
      schema.sourceReference,
      eq(schema.sourceReference.id, schema.storySourceReference.sourceReferenceId),
    )
    .where(inArray(schema.storySourceReference.storyId, storyIds))
    .orderBy(schema.storySourceReference.addedAt)
  for (const { storyId, ...ref } of rows) if (!map.has(storyId)) map.set(storyId, ref)
  return map
}

export async function sourceCounts(db: Db, storyIds: string[]) {
  if (storyIds.length === 0) return new Map<string, number>()
  const rows = await db
    .select({ storyId: schema.storyArticle.storyId, n: sql<number>`count(*)::int` })
    .from(schema.storyArticle)
    .where(
      and(inArray(schema.storyArticle.storyId, storyIds), isNull(schema.storyArticle.removedAt)),
    )
    .groupBy(schema.storyArticle.storyId)
  return new Map(rows.map((r) => [r.storyId, r.n]))
}

export async function storyListItems(db: Db, storyIds: string[]): Promise<StoryListItem[]> {
  if (storyIds.length === 0) return []
  const [rows, publishers, narratives, counts, traces, relations, primary] = await Promise.all([
    db
      .select({ story: storyColumns, summary: schema.storySummaryVersion.body })
      .from(schema.story)
      .leftJoin(
        schema.storySummaryVersion,
        eq(schema.storySummaryVersion.id, schema.story.currentSummaryId),
      )
      .where(inArray(schema.story.id, storyIds)),
    publishersByStory(db, storyIds),
    narrativesByStory(db, storyIds),
    sourceCounts(db, storyIds),
    tracesByStory(db, storyIds),
    relationsByStory(db, storyIds),
    primarySourceByStory(db, storyIds),
  ])
  const byId = new Map(rows.map((r) => [r.story.id, r]))
  return storyIds.flatMap((id) => {
    const row = byId.get(id)
    if (!row) return []
    const s = row.story
    return [
      {
        id: s.id,
        slug: s.slug,
        title: s.title,
        summary: row.summary,
        status: s.status,
        firstObservedAt: iso(s.firstObservedAt),
        lastUpdatedAt: iso(s.lastUpdatedAt),
        sourceCount: counts.get(s.id) ?? 0,
        regions: s.regions,
        topics: s.topics,
        desk: s.desk,
        publishers: publishers.get(s.id) ?? [],
        narratives: narratives.get(s.id) ?? [],
        trace: traces.get(s.id) ?? [],
        relation: relations.get(s.id) ?? null,
        primarySource: primary.get(s.id) ?? null,
        correction: relations.get(s.id)?.type === 'corrects',
      },
    ]
  })
}

const STORY_PAGE_SIZE = 30

type ListStoriesOptions = { limit?: number; cursor?: string | null; region?: Region }

/**
 * Latest, newest first. The first page at the default size is the same for every reader, so
 * it is shared. Nothing else is: cached() never evicts, and cursors and limits are unbounded.
 */
export function listStories(db: Db, opts: ListStoriesOptions): Promise<StoryListResponse> {
  const firstPage = !opts.cursor && (opts.limit ?? STORY_PAGE_SIZE) === STORY_PAGE_SIZE
  return firstPage
    ? cached(`stories:${opts.region ?? 'all'}`, SHARED_TTL_MS, () => loadStories(db, opts))
    : loadStories(db, opts)
}

// Cursor = "<lastUpdatedAt ISO>|<id>" for stable keyset pagination.
async function loadStories(db: Db, opts: ListStoriesOptions): Promise<StoryListResponse> {
  const limit = Math.min(Math.max(opts.limit ?? STORY_PAGE_SIZE, 1), 100)
  let cursorFilter = sql`true`
  if (opts.cursor) {
    const [at, id] = opts.cursor.split('|')
    if (at && id) {
      const date = new Date(at)
      cursorFilter =
        or(
          lt(schema.story.lastUpdatedAt, date),
          and(eq(schema.story.lastUpdatedAt, date), lt(schema.story.id, id)),
        ) ?? sql`true`
    }
  }
  const rows = await db
    .select({ id: schema.story.id, lastUpdatedAt: schema.story.lastUpdatedAt })
    .from(schema.story)
    .where(
      and(
        isNotNull(schema.story.publishedAt),
        isNull(schema.story.mergedIntoStoryId),
        opts.region ? arrayContains(schema.story.regions, [opts.region]) : undefined,
        cursorFilter,
      ),
    )
    .orderBy(desc(schema.story.lastUpdatedAt), desc(schema.story.id))
    .limit(limit + 1)
  const page = rows.slice(0, limit)
  const last = page[page.length - 1]
  return {
    items: await storyListItems(
      db,
      page.map((r) => r.id),
    ),
    pageInfo: {
      nextCursor: rows.length > limit && last ? `${iso(last.lastUpdatedAt)}|${last.id}` : null,
    },
  }
}
