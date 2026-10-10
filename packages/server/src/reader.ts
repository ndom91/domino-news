import { type Db, schema } from '@dn/db'
import type {
  NarrativeDetail,
  NarrativeListResponse,
  NarrativeRef,
  PublisherRef,
  StoryDetail,
  StoryListItem,
  StoryListResponse,
} from '@dn/schemas'
import { and, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'

const iso = (d: Date) => d.toISOString()

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

async function narrativesByStory(db: Db, storyIds: string[]) {
  const map = new Map<string, NarrativeRef[]>()
  if (storyIds.length === 0) return map
  const rows = await db
    .select({
      storyId: schema.narrativeStory.storyId,
      id: schema.narrative.id,
      slug: schema.narrative.slug,
      title: schema.narrative.title,
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
    .select({ story: schema.story, summary: schema.storySummaryVersion.body })
    .from(schema.story)
    .leftJoin(
      schema.storySummaryVersion,
      eq(schema.storySummaryVersion.id, schema.story.currentSummaryId),
    )
    .where(inArray(schema.story.id, storyIds))
  const [publishers, narratives, counts] = await Promise.all([
    publishersByStory(db, storyIds),
    narrativesByStory(db, storyIds),
    sourceCounts(db, storyIds),
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
        publishers: publishers.get(s.id) ?? [],
        narratives: narratives.get(s.id) ?? [],
      },
    ]
  })
}

// Cursor = "<lastUpdatedAt ISO>|<id>" for stable keyset pagination.
export async function listStories(
  db: Db,
  opts: { limit?: number; cursor?: string | null },
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
  if (!id) return null
  const [story] = await db.select().from(schema.story).where(eq(schema.story.id, id))
  if (!story || !story.publishedAt) return null

  const versions = await db
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
    .orderBy(desc(schema.storySummaryVersion.createdAt))
  const current = versions.find((v) => v.version.id === story.currentSummaryId)
  const cited = current
    ? await db
        .select({ articleId: schema.storySummarySource.articleId })
        .from(schema.storySummarySource)
        .where(eq(schema.storySummarySource.summaryVersionId, current.version.id))
    : []
  const citedIds = new Set(cited.map((c) => c.articleId))

  const sources = await db
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
    })
    .from(schema.storyArticle)
    .innerJoin(schema.article, eq(schema.article.id, schema.storyArticle.articleId))
    .innerJoin(
      schema.articleRevision,
      eq(schema.articleRevision.id, schema.article.latestRevisionId),
    )
    .innerJoin(schema.publisher, eq(schema.publisher.id, schema.article.publisherId))
    .where(and(eq(schema.storyArticle.storyId, id), isNull(schema.storyArticle.removedAt)))
    .orderBy(schema.article.publishedAt)

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
        .select()
        .from(schema.story)
        .where(and(inArray(schema.story.id, otherIds), isNotNull(schema.story.publishedAt)))
    : []
  const otherById = new Map(others.map((o) => [o.id, o]))

  const primary = await db
    .select({ ref: schema.sourceReference })
    .from(schema.storySourceReference)
    .innerJoin(
      schema.sourceReference,
      eq(schema.sourceReference.id, schema.storySourceReference.sourceReferenceId),
    )
    .where(eq(schema.storySourceReference.storyId, id))

  return {
    id: story.id,
    slug: story.slug,
    title: story.title,
    status: story.status,
    firstObservedAt: iso(story.firstObservedAt),
    lastUpdatedAt: iso(story.lastUpdatedAt),
    publishedAt: iso(story.publishedAt),
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
    summaryHistory: versions.map((v) => ({
      versionId: v.version.id,
      createdAt: iso(v.version.createdAt),
      origin: v.version.editedByUserId ? ('edited' as const) : ('generated' as const),
    })),
    sources: sources.map((s) => ({
      articleId: s.articleId,
      title: s.title,
      description: s.description,
      url: s.url,
      publishedAt: s.publishedAt ? iso(s.publishedAt) : null,
      observedAt: iso(s.observedAt),
      publisher: s.publisher,
      citedInSummary: citedIds.has(s.articleId),
    })),
    related: edges.flatMap((e) => {
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
    }),
    narratives: (await narrativesByStory(db, [id])).get(id) ?? [],
    primarySources: primary.map(({ ref }) => ({
      id: ref.id,
      url: ref.url,
      title: ref.title,
      kind: ref.kind,
      discoveredAt: iso(ref.discoveredAt),
    })),
  }
}

export async function getNarrative(db: Db, idOrSlug: string): Promise<NarrativeDetail | null> {
  const [narrative] = await db
    .select()
    .from(schema.narrative)
    .where(or(eq(schema.narrative.id, idOrSlug), eq(schema.narrative.slug, idOrSlug)))
  if (!narrative) return null
  const stories = await db
    .select({ story: schema.story, summary: schema.storySummaryVersion.body })
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
  const [counts, edges] = await Promise.all([
    sourceCounts(db, ids),
    db
      .select()
      .from(schema.storyRelationship)
      .where(
        and(
          isNull(schema.storyRelationship.supersededAt),
          inArray(schema.storyRelationship.fromStoryId, ids),
          inArray(schema.storyRelationship.toStoryId, ids),
        ),
      ),
  ])
  return {
    id: narrative.id,
    slug: narrative.slug,
    title: narrative.title,
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

export async function listNarratives(db: Db): Promise<NarrativeListResponse> {
  const rows = await db
    .select({
      id: schema.narrative.id,
      slug: schema.narrative.slug,
      title: schema.narrative.title,
      description: schema.narrative.description,
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
    .orderBy(desc(schema.narrative.updatedAt))
    .limit(50)
  return { items: rows.map((r) => ({ ...r, updatedAt: iso(r.updatedAt) })) }
}
