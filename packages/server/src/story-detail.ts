import { type Db, schema } from '@dn/db'
import type { Desk, StoryDetail, StoryLead } from '@dn/schemas'
import { and, desc, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm'
import { leanMixByStory } from './lean.ts'
import { narrativesByStory, storyColumns } from './story-list.ts'

const iso = (d: Date) => d.toISOString()

/**
 * Accepts a Story id, current slug, or a historical alias (merged/renamed stories) and
 * returns the Story's row: one query unless the Story was merged or renamed.
 */
export async function resolveStory(db: Db, idOrSlug: string): Promise<StoryRow | null> {
  const [direct] = await db
    .select(storyColumns)
    .from(schema.story)
    .where(or(eq(schema.story.id, idOrSlug), eq(schema.story.slug, idOrSlug)))
  if (direct) return direct.mergedIntoStoryId ? storyRow(db, direct.mergedIntoStoryId) : direct
  const [alias] = await db
    .select({ id: schema.storyAlias.storyId })
    .from(schema.storyAlias)
    .where(eq(schema.storyAlias.alias, idOrSlug))
  return alias ? storyRow(db, alias.id) : null
}

/** The Story page by id. Unpublished Stories read as missing. */
export async function loadStory(db: Db, id: string): Promise<StoryDetail | null> {
  const story = await storyRow(db, id)
  return story ? storyDetail(db, story) : null
}

/** `loadStory` for an id, slug or alias (share images): resolving also reads the row. */
export async function getStory(db: Db, idOrSlug: string): Promise<StoryDetail | null> {
  const story = await resolveStory(db, idOrSlug)
  return story ? storyDetail(db, story) : null
}

async function storyDetail(db: Db, story: StoryRow): Promise<StoryDetail | null> {
  if (!story.publishedAt) return null
  const [{ lead, detail, context }, versions, related, primary, leanMix] = await Promise.all([
    storyLeadParts(db, story),
    db
      .select({
        id: schema.storySummaryVersion.id,
        createdAt: schema.storySummaryVersion.createdAt,
        editedByUserId: schema.storySummaryVersion.editedByUserId,
      })
      .from(schema.storySummaryVersion)
      .where(eq(schema.storySummaryVersion.storyId, story.id))
      .orderBy(desc(schema.storySummaryVersion.createdAt))
      .limit(10),
    relatedStories(db, story.id),
    db
      .select({ ref: schema.sourceReference })
      .from(schema.storySourceReference)
      .innerJoin(
        schema.sourceReference,
        eq(schema.sourceReference.id, schema.storySourceReference.sourceReferenceId),
      )
      .where(eq(schema.storySourceReference.storyId, story.id)),
    leanMixByStory(db, [story.id]),
  ])

  return {
    ...lead,
    summary: lead.summary && { ...lead.summary, detail },
    context,
    status: story.status,
    firstObservedAt: iso(story.firstObservedAt),
    lastUpdatedAt: iso(story.lastUpdatedAt),
    publishedAt: iso(story.publishedAt),
    regions: story.regions,
    topics: story.topics,
    summaryHistory: versions.map((v) => ({
      versionId: v.id,
      createdAt: iso(v.createdAt),
      origin: v.editedByUserId ? ('edited' as const) : ('generated' as const),
    })),
    related,
    // Claims are no longer generated; the field stays for app builds that still parse it.
    claims: [],
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

type StoryRow = NonNullable<Awaited<ReturnType<typeof storyRow>>>

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
  const [current, cited, sources, narratives, context] = await Promise.all([
    story.currentSummaryId
      ? db
          .select({
            version: schema.storySummaryVersion,
            modelId: schema.analysisRun.modelId,
          })
          .from(schema.storySummaryVersion)
          .leftJoin(
            schema.interpretation,
            eq(schema.interpretation.id, schema.storySummaryVersion.interpretationId),
          )
          .leftJoin(
            schema.analysisRun,
            eq(schema.analysisRun.id, schema.interpretation.analysisRunId),
          )
          .where(eq(schema.storySummaryVersion.id, story.currentSummaryId))
          .then(([version]) => version ?? null)
      : null,
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
  const body = current?.version.body ?? ''
  const detail = current?.version.detail ?? null
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
    // The lead shows the body only; the Story page also shows the detail.
    context: context.filter((c) => body.includes(c.anchorText)),
  }
  return {
    lead,
    detail,
    context: context.filter((c) => body.includes(c.anchorText) || detail?.includes(c.anchorText)),
  }
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
