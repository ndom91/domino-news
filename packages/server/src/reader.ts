import { type Db, schema } from '@dn/db'
import type {
  Desk,
  NarrativeDetail,
  NarrativeListResponse,
  NarrativeRef,
  PublisherRef,
  Region,
  StoryDetail,
  StoryLead,
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
  sql,
} from 'drizzle-orm'
import { leanMixByStory } from './lean.ts'

const iso = (d: Date) => d.toISOString()

// Reads never need the embedding (768 floats, ~9.5 KB per row as text).
const { embedding: _embedding, ...storyColumns } = getTableColumns(schema.story)

/** Accepts a Story id, current slug, or a historical alias (merged/renamed stories). */
export async function resolveStoryId(db: Db, idOrSlug: string): Promise<string | null> {
  const [direct] = await db
    .select({ id: schema.story.id, mergedInto: schema.story.mergedIntoStoryId })
    .from(schema.story)
    .where(or(eq(schema.story.id, idOrSlug), eq(schema.story.slug, idOrSlug)))
  if (direct) return direct.mergedInto ?? direct.id
  const [alias] = await db
    .select({ id: schema.storyAlias.storyId })
    .from(schema.storyAlias)
    .where(eq(schema.storyAlias.alias, idOrSlug))
  return alias?.id ?? null
}

async function publishersByStory(db: Db, storyIds: string[]) {
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
 * A Narrative's desk: the one most of its Stories share (ties: most recently updated), so
 * its colour is stable. Outer column written literally (see AGENTS.md).
 */
export const narrativeDesk = sql<Desk | null>`(
  select s.desk from narrative_story ns join story s on s.id = ns.story_id
  where ns.narrative_id = narrative.id and ns.removed_at is null and s.desk is not null
  group by s.desk order by count(*) desc, max(s.last_updated_at) desc limit 1)`

async function narrativesByStory(db: Db, storyIds: string[]) {
  const map = new Map<string, NarrativeRef[]>()
  if (storyIds.length === 0) return map
  const rows = await db
    .select({
      storyId: schema.narrativeStory.storyId,
      id: schema.narrative.id,
      slug: schema.narrative.slug,
      title: schema.narrative.title,
      desk: narrativeDesk,
    })
    .from(schema.narrativeStory)
    .innerJoin(schema.narrative, eq(schema.narrative.id, schema.narrativeStory.narrativeId))
    .where(
      and(
        inArray(schema.narrativeStory.storyId, storyIds),
        isNull(schema.narrativeStory.removedAt),
      ),
    )
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

/** Active relationships with both ends in `storyIds`. */
export function edgesWithin(db: Db, storyIds: string[]) {
  return db
    .select()
    .from(schema.storyRelationship)
    .where(
      and(
        isNull(schema.storyRelationship.supersededAt),
        inArray(schema.storyRelationship.fromStoryId, storyIds),
        inArray(schema.storyRelationship.toStoryId, storyIds),
      ),
    )
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

async function sourceCounts(db: Db, storyIds: string[]) {
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
  const rows = await db
    .select({ story: storyColumns, summary: schema.storySummaryVersion.body })
    .from(schema.story)
    .leftJoin(
      schema.storySummaryVersion,
      eq(schema.storySummaryVersion.id, schema.story.currentSummaryId),
    )
    .where(inArray(schema.story.id, storyIds))
  const [publishers, narratives, counts, traces, relations, primary] = await Promise.all([
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

// Cursor = "<lastUpdatedAt ISO>|<id>" for stable keyset pagination.
export async function listStories(
  db: Db,
  opts: { limit?: number; cursor?: string | null; region?: Region },
): Promise<StoryListResponse> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100)
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

export async function getStory(db: Db, idOrSlug: string): Promise<StoryDetail | null> {
  const id = await resolveStoryId(db, idOrSlug)
  const story = id ? await storyRow(db, id) : null
  if (!story?.publishedAt) return null

  const [{ lead, versions }, related, primary, claims, leanMix] = await Promise.all([
    storyLeadParts(db, story),
    relatedStories(db, story.id),
    db
      .select({ ref: schema.sourceReference })
      .from(schema.storySourceReference)
      .innerJoin(
        schema.sourceReference,
        eq(schema.sourceReference.id, schema.storySourceReference.sourceReferenceId),
      )
      .where(eq(schema.storySourceReference.storyId, story.id)),
    storyClaims(db, story.id),
    leanMixByStory(db, [story.id]),
  ])

  return {
    ...lead,
    status: story.status,
    firstObservedAt: iso(story.firstObservedAt),
    lastUpdatedAt: iso(story.lastUpdatedAt),
    publishedAt: iso(story.publishedAt),
    regions: story.regions,
    topics: story.topics,
    summaryHistory: versions.map((v) => ({
      versionId: v.version.id,
      createdAt: iso(v.version.createdAt),
      origin: v.version.editedByUserId ? ('edited' as const) : ('generated' as const),
    })),
    related,
    claims,
    leanMix: leanMix.get(story.id) ?? [],
    primarySources: primary.map(({ ref }) => ({
      id: ref.id,
      url: ref.url,
      title: ref.title,
      kind: ref.kind,
      discoveredAt: iso(ref.discoveredAt),
    })),
  }
}

/** The front page's lead: only what the lead block shows (a fraction of getStory's reads). */
export async function getStoryLead(db: Db, id: string): Promise<StoryLead | null> {
  const story = await storyRow(db, id)
  return story?.publishedAt ? (await storyLeadParts(db, story)).lead : null
}

async function storyRow(db: Db, id: string) {
  const [story] = await db.select(storyColumns).from(schema.story).where(eq(schema.story.id, id))
  return story ?? null
}

async function storyLeadParts(
  db: Db,
  story: {
    id: string
    slug: string
    title: string
    desk: Desk | null
    currentSummaryId: string | null
  },
) {
  const id = story.id
  const [versions, cited, sources, narratives, context] = await Promise.all([
    db
      .select({
        version: schema.storySummaryVersion,
        modelId: schema.analysisRun.modelId,
      })
      .from(schema.storySummaryVersion)
      .leftJoin(
        schema.interpretation,
        eq(schema.interpretation.id, schema.storySummaryVersion.interpretationId),
      )
      .leftJoin(schema.analysisRun, eq(schema.analysisRun.id, schema.interpretation.analysisRunId))
      .where(eq(schema.storySummaryVersion.storyId, id))
      .orderBy(desc(schema.storySummaryVersion.createdAt)),
    story.currentSummaryId
      ? db
          .select({
            articleId: schema.storySummarySource.articleId,
            citation: schema.storySummarySource.citation,
          })
          .from(schema.storySummarySource)
          .where(eq(schema.storySummarySource.summaryVersionId, story.currentSummaryId))
      : [],
    db
      .select({
        articleId: schema.article.id,
        url: schema.article.canonicalUrl,
        publishedAt: schema.article.publishedAt,
        title: schema.articleRevision.title,
        description: schema.articleRevision.description,
        observedAt: schema.articleRevision.observedAt,
        publisher: {
          id: schema.publisher.id,
          slug: schema.publisher.slug,
          name: schema.publisher.name,
          domain: schema.publisher.domain,
        },
        publisherKind: schema.publisher.kind,
      })
      .from(schema.storyArticle)
      .innerJoin(schema.article, eq(schema.article.id, schema.storyArticle.articleId))
      .innerJoin(
        schema.articleRevision,
        eq(schema.articleRevision.id, schema.article.latestRevisionId),
      )
      .innerJoin(schema.publisher, eq(schema.publisher.id, schema.article.publisherId))
      .where(and(eq(schema.storyArticle.storyId, id), isNull(schema.storyArticle.removedAt)))
      .orderBy(schema.article.publishedAt),
    narrativesByStory(db, [id]),
    storyContext(db, id),
  ])
  const current = versions.find((v) => v.version.id === story.currentSummaryId)
  const citedIds = new Set(cited.map((c) => c.articleId))
  const citationOf = new Map(cited.map((c) => [c.articleId, c.citation]))

  const lead: StoryLead = {
    id,
    slug: story.slug,
    title: story.title,
    desk: story.desk,
    summary: current
      ? {
          versionId: current.version.id,
          headline: current.version.headline,
          body: current.version.body,
          format: current.version.format,
          createdAt: iso(current.version.createdAt),
          origin: current.version.editedByUserId ? 'edited' : 'generated',
          modelId: current.modelId,
          citedArticleIds: [...citedIds],
        }
      : null,
    sources: sources.map((s) => ({
      articleId: s.articleId,
      title: s.title,
      description: s.description,
      url: s.url,
      publishedAt: s.publishedAt ? iso(s.publishedAt) : null,
      observedAt: iso(s.observedAt),
      publisher: s.publisher,
      official: s.publisherKind === 'official',
      citedInSummary: citedIds.has(s.articleId),
      citation: citationOf.get(s.articleId) ?? null,
    })),
    narratives: narratives.get(id) ?? [],
    // Only entries whose anchor is still in the current text (an edit may have removed it).
    context: context.filter((c) => current?.version.body.includes(c.anchorText)),
  }
  return { lead, versions }
}

async function relatedStories(db: Db, id: string): Promise<StoryDetail['related']> {
  const edges = await db
    .select()
    .from(schema.storyRelationship)
    .where(
      and(
        isNull(schema.storyRelationship.supersededAt),
        or(
          eq(schema.storyRelationship.fromStoryId, id),
          eq(schema.storyRelationship.toStoryId, id),
        ),
      ),
    )
  const otherIds = edges.map((e) => (e.fromStoryId === id ? e.toStoryId : e.fromStoryId))
  const others = otherIds.length
    ? await db
        .select(storyColumns)
        .from(schema.story)
        .where(and(inArray(schema.story.id, otherIds), isNotNull(schema.story.publishedAt)))
    : []
  const otherById = new Map(others.map((o) => [o.id, o]))
  return edges.flatMap((e) => {
    const otherId = e.fromStoryId === id ? e.toStoryId : e.fromStoryId
    const other = otherById.get(otherId)
    if (!other) return []
    return [
      {
        id: other.id,
        slug: other.slug,
        title: other.title,
        relation: e.relation,
        direction: e.fromStoryId === id ? ('outgoing' as const) : ('incoming' as const),
        lastUpdatedAt: iso(other.lastUpdatedAt),
      },
    ]
  })
}

export async function getNarrative(db: Db, idOrSlug: string): Promise<NarrativeDetail | null> {
  const [row] = await db
    .select({ narrative: schema.narrative, desk: narrativeDesk })
    .from(schema.narrative)
    .where(or(eq(schema.narrative.id, idOrSlug), eq(schema.narrative.slug, idOrSlug)))
  if (!row) return null
  const { narrative, desk } = row
  const stories = await db
    .select({ story: storyColumns, summary: schema.storySummaryVersion.body })
    .from(schema.narrativeStory)
    .innerJoin(schema.story, eq(schema.story.id, schema.narrativeStory.storyId))
    .leftJoin(
      schema.storySummaryVersion,
      eq(schema.storySummaryVersion.id, schema.story.currentSummaryId),
    )
    .where(
      and(
        eq(schema.narrativeStory.narrativeId, narrative.id),
        isNull(schema.narrativeStory.removedAt),
        isNotNull(schema.story.publishedAt),
      ),
    )
    .orderBy(schema.story.firstObservedAt)
  if (stories.length === 0) return null
  const ids = stories.map((s) => s.story.id)
  const [counts, edges] = await Promise.all([sourceCounts(db, ids), edgesWithin(db, ids)])
  return {
    id: narrative.id,
    slug: narrative.slug,
    title: narrative.title,
    desk,
    description: narrative.description,
    createdAt: iso(narrative.createdAt),
    updatedAt: iso(narrative.updatedAt),
    stories: stories.map(({ story, summary }) => ({
      id: story.id,
      slug: story.slug,
      title: story.title,
      summary,
      firstObservedAt: iso(story.firstObservedAt),
      lastUpdatedAt: iso(story.lastUpdatedAt),
      sourceCount: counts.get(story.id) ?? 0,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      fromStoryId: e.fromStoryId,
      toStoryId: e.toStoryId,
      relation: e.relation,
    })),
  }
}

// Smaller Narratives still exist (and show on Story pages) but aren't listed: every Story
// already needs 2+ outlets, so 4 Stories marks a real thread rather than a pair.
export const MIN_NARRATIVE_STORIES = 4

export async function listNarratives(db: Db): Promise<NarrativeListResponse> {
  const rows = await db
    .select({
      id: schema.narrative.id,
      slug: schema.narrative.slug,
      title: schema.narrative.title,
      description: schema.narrative.description,
      desk: narrativeDesk,
      updatedAt: schema.narrative.updatedAt,
      storyCount: sql<number>`count(${schema.story.id})::int`,
    })
    .from(schema.narrative)
    .innerJoin(
      schema.narrativeStory,
      and(
        eq(schema.narrativeStory.narrativeId, schema.narrative.id),
        isNull(schema.narrativeStory.removedAt),
      ),
    )
    .innerJoin(
      schema.story,
      and(eq(schema.story.id, schema.narrativeStory.storyId), isNotNull(schema.story.publishedAt)),
    )
    .groupBy(schema.narrative.id)
    .having(sql`count(${schema.story.id}) >= ${MIN_NARRATIVE_STORIES}`)
    .orderBy(desc(schema.narrative.updatedAt))
    // Grouped by period on the page, with older periods collapsed.
    .limit(300)
  return {
    items: rows.map((r) => ({ ...r, updatedAt: iso(r.updatedAt) })),
  }
}

async function storyContext(db: Db, storyId: string): Promise<StoryDetail['context']> {
  const rows = await db
    .select({
      id: schema.contextEntry.id,
      title: schema.contextEntry.title,
      kind: schema.contextEntry.kind,
      anchorText: schema.storyContext.anchorText,
      explanation: schema.contextEntryVersion.explanation,
      interpretationId: schema.contextEntryVersion.interpretationId,
    })
    .from(schema.storyContext)
    .innerJoin(schema.contextEntry, eq(schema.contextEntry.id, schema.storyContext.contextEntryId))
    .innerJoin(
      schema.contextEntryVersion,
      eq(schema.contextEntryVersion.id, schema.contextEntry.currentVersionId),
    )
    .where(eq(schema.storyContext.storyId, storyId))
  if (rows.length === 0) return []
  const sources = await db
    .selectDistinct({
      interpretationId: schema.interpretationEvidence.interpretationId,
      articleId: schema.article.id,
      url: schema.article.canonicalUrl,
      title: schema.articleRevision.title,
      publisherName: schema.publisher.name,
    })
    .from(schema.interpretationEvidence)
    .innerJoin(
      schema.observation,
      eq(schema.observation.id, schema.interpretationEvidence.observationId),
    )
    .innerJoin(schema.article, eq(schema.article.id, schema.observation.subjectId))
    .innerJoin(
      schema.articleRevision,
      eq(schema.articleRevision.id, schema.article.latestRevisionId),
    )
    .innerJoin(schema.publisher, eq(schema.publisher.id, schema.article.publisherId))
    .where(
      inArray(
        schema.interpretationEvidence.interpretationId,
        rows.map((r) => r.interpretationId),
      ),
    )
  return rows.map(({ interpretationId, ...entry }) => ({
    ...entry,
    sources: sources
      .filter((s) => s.interpretationId === interpretationId)
      .map(({ interpretationId: _, ...s }) => s),
  }))
}

async function storyClaims(db: Db, storyId: string): Promise<StoryDetail['claims']> {
  const claims = await db
    .select({
      id: schema.claim.id,
      proposition: schema.claim.proposition,
      createdAt: schema.claim.createdAt,
    })
    .from(schema.claim)
    .where(and(eq(schema.claim.storyId, storyId), isNull(schema.claim.supersededAt)))
    .orderBy(schema.claim.createdAt)
  if (claims.length === 0) return []
  const ids = claims.map((c) => c.id)
  const [mentions, evidence] = await Promise.all([
    db
      .select({
        claimId: schema.claimMention.claimId,
        stance: schema.claimMention.stance,
        articleId: schema.claimMention.articleId,
        reportedAt: sql<Date>`coalesce(${schema.article.publishedAt}, ${schema.article.firstSeenAt})`,
        publisher: {
          id: schema.publisher.id,
          slug: schema.publisher.slug,
          name: schema.publisher.name,
          domain: schema.publisher.domain,
        },
      })
      .from(schema.claimMention)
      .innerJoin(schema.article, eq(schema.article.id, schema.claimMention.articleId))
      .innerJoin(schema.publisher, eq(schema.publisher.id, schema.article.publisherId))
      .where(inArray(schema.claimMention.claimId, ids)),
    db
      .select({
        claimId: schema.claimEvidence.claimId,
        relationship: schema.claimEvidence.relationship,
        url: schema.sourceReference.url,
        title: schema.sourceReference.title,
      })
      .from(schema.claimEvidence)
      .innerJoin(
        schema.sourceReference,
        eq(schema.sourceReference.id, schema.claimEvidence.sourceReferenceId),
      )
      .where(inArray(schema.claimEvidence.claimId, ids)),
  ])
  return claims.map((c) => {
    const own = mentions.filter((m) => m.claimId === c.id)
    const first = own.reduce<Date | null>(
      (min, m) => (!min || new Date(m.reportedAt) < min ? new Date(m.reportedAt) : min),
      null,
    )
    return {
      ...c,
      createdAt: iso(c.createdAt),
      firstReportedAt: first ? iso(first) : null,
      mentions: own.map(({ claimId: _, reportedAt: __, ...m }) => m),
      evidence: evidence.filter((e) => e.claimId === c.id).map(({ claimId: _, ...e }) => e),
    }
  })
}
