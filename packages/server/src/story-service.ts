import { createHash } from 'node:crypto'
import { type Db, schema } from '@dn/db'
import { ID_PREFIX, newId, renumberCitations, slugify } from '@dn/domain'
import type { StorySummaryOutput } from '@dn/schemas'
import { and, countDistinct, eq, inArray, isNull } from 'drizzle-orm'
import { touchStory } from './outbox.ts'

export function sha256(input: string) {
  return createHash('sha256').update(input).digest('hex')
}

export class DomainError extends Error {
  constructor(
    readonly code: 'not_found' | 'conflict' | 'bad_request',
    message: string,
  ) {
    super(message)
  }
}

/** Active article revisions currently backing a Story; drives staleness checks. */
export async function storyInputFingerprint(db: Db, storyId: string) {
  const rows = await db
    .select({ revisionId: schema.article.latestRevisionId })
    .from(schema.storyArticle)
    .innerJoin(schema.article, eq(schema.article.id, schema.storyArticle.articleId))
    .where(and(eq(schema.storyArticle.storyId, storyId), isNull(schema.storyArticle.removedAt)))
  return sha256(
    rows
      .map((r) => r.revisionId ?? '')
      .sort()
      .join(','),
  )
}

async function uniqueSlug(db: Db, title: string) {
  const base = slugify(title)
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`
    const [taken] = await db
      .select({ id: schema.story.id })
      .from(schema.story)
      .where(eq(schema.story.slug, slug))
    if (!taken) return slug
  }
  return `${base}-${newId('x').slice(-6)}`
}

export async function refreshFingerprint(db: Db, storyId: string) {
  const fingerprint = await storyInputFingerprint(db, storyId)
  await db
    .update(schema.story)
    .set({ inputFingerprint: fingerprint })
    .where(eq(schema.story.id, storyId))
  return fingerprint
}

/** New unpublished Story seeded by one article. Published later, once a summary exists. */
export async function createStoryWithArticle(
  db: Db,
  input: {
    articleId: string
    title: string
    observedAt: Date
    analysisRunId?: string
    matchMethod: string
  },
) {
  const id = newId(ID_PREFIX.story)
  const now = new Date()
  await db.insert(schema.story).values({
    id,
    slug: await uniqueSlug(db, input.title),
    title: input.title,
    firstObservedAt: input.observedAt,
    lastUpdatedAt: now,
  })
  await db.insert(schema.storyArticle).values({
    id: newId(ID_PREFIX.storyArticle),
    storyId: id,
    articleId: input.articleId,
    addedAt: now,
    analysisRunId: input.analysisRunId,
    matchMethod: input.matchMethod,
  })
  await refreshFingerprint(db, id)
  await touchStory(db, id, 'story.created', now)
  return id
}

export async function attachArticleToStory(
  db: Db,
  input: {
    storyId: string
    articleId: string
    observedAt: Date
    confidence?: number
    analysisRunId?: string
    matchMethod: string
  },
) {
  const now = new Date()
  await db.insert(schema.storyArticle).values({
    id: newId(ID_PREFIX.storyArticle),
    storyId: input.storyId,
    articleId: input.articleId,
    addedAt: now,
    confidence: input.confidence,
    analysisRunId: input.analysisRunId,
    matchMethod: input.matchMethod,
  })
  const [story] = await db
    .select({ firstObservedAt: schema.story.firstObservedAt })
    .from(schema.story)
    .where(eq(schema.story.id, input.storyId))
  if (story && input.observedAt < story.firstObservedAt) {
    await db
      .update(schema.story)
      .set({ firstObservedAt: input.observedAt })
      .where(eq(schema.story.id, input.storyId))
  }
  await refreshFingerprint(db, input.storyId)
  await touchStory(db, input.storyId, 'story.article_added', now)
}

/** Distinct newsroom publishers among a Story's active articles (official sources excluded). */
export async function newsroomOutletCount(db: Db, storyId: string): Promise<number> {
  const [row] = await db
    .select({ n: countDistinct(schema.article.publisherId) })
    .from(schema.storyArticle)
    .innerJoin(schema.article, eq(schema.article.id, schema.storyArticle.articleId))
    .innerJoin(schema.publisher, eq(schema.publisher.id, schema.article.publisherId))
    .where(
      and(
        eq(schema.storyArticle.storyId, storyId),
        isNull(schema.storyArticle.removedAt),
        eq(schema.publisher.kind, 'newsroom'),
      ),
    )
  return row?.n ?? 0
}

/**
 * Persist a generated summary as a new immutable version, then publish the Story.
 * Rejects stale results (inputs changed since generation) and ungrounded citations.
 */
export async function recordGeneratedSummary(
  db: Db,
  input: {
    storyId: string
    output: StorySummaryOutput
    analysisRunId: string
    inputFingerprint: string
    /** Article ids in the order shown to the model; enables `[n]` citation markers. */
    shownArticleIds?: string[]
  },
): Promise<{ status: 'recorded'; versionId: string } | { status: 'stale' }> {
  const [story] = await db
    .select()
    .from(schema.story)
    .where(eq(schema.story.id, input.storyId))
    .for('update')
  if (!story) throw new DomainError('not_found', `story ${input.storyId} not found`)
  if (story.inputFingerprint !== input.inputFingerprint) return { status: 'stale' }
  if (story.currentSummaryId) {
    // Same inputs already summarised (retry/duplicate) or a human edit on these inputs wins.
    // Exception: a generated summary from before desk tagging may be refreshed to get one.
    const [current] = await db
      .select()
      .from(schema.storySummaryVersion)
      .where(eq(schema.storySummaryVersion.id, story.currentSummaryId))
    const refreshForDesk = story.desk === null && current?.editedByUserId === null
    if (current?.inputFingerprint === input.inputFingerprint && !refreshForDesk)
      return { status: 'stale' }
  }

  // Grounding: every cited article must be actively linked to this Story, and every
  // cited observation must be about one of those articles.
  const linked = await db
    .select({ articleId: schema.storyArticle.articleId })
    .from(schema.storyArticle)
    .where(and(eq(schema.storyArticle.storyId, story.id), isNull(schema.storyArticle.removedAt)))
  const linkedIds = new Set(linked.map((l) => l.articleId))
  const { body, citation } = renumberCitations(
    input.output.summary,
    input.shownArticleIds ?? [],
    input.output.sourceArticleIds,
  )
  const citedArticles = [...citation.keys()]
  const unknownArticles = citedArticles.filter((id) => !linkedIds.has(id))
  if (citedArticles.length === 0 || unknownArticles.length > 0) {
    throw new DomainError(
      'bad_request',
      `summary cites unlinked articles: ${unknownArticles.join(',')}`,
    )
  }
  const citedObservations = [...new Set(input.output.observationIds)]
  const observations = citedObservations.length
    ? await db
        .select({ id: schema.observation.id, subjectId: schema.observation.subjectId })
        .from(schema.observation)
        .where(inArray(schema.observation.id, citedObservations))
    : []
  const badObservations = citedObservations.filter((id) => {
    const obs = observations.find((o) => o.id === id)
    return !obs || !linkedIds.has(obs.subjectId)
  })
  if (observations.length === 0 || badObservations.length > 0) {
    throw new DomainError(
      'bad_request',
      `summary cites invalid observations: ${badObservations.join(',')}`,
    )
  }

  const interpretationId = newId(ID_PREFIX.interpretation)
  await db.insert(schema.interpretation).values({
    id: interpretationId,
    type: 'story_summary',
    subjectType: 'story',
    subjectId: story.id,
    output: input.output,
    analysisRunId: input.analysisRunId,
  })
  await db.insert(schema.interpretationEvidence).values(
    citedObservations.map((observationId) => ({
      interpretationId,
      observationId,
      relationship: 'derived_from' as const,
    })),
  )
  const versionId = newId(ID_PREFIX.summaryVersion)
  await db.insert(schema.storySummaryVersion).values({
    id: versionId,
    storyId: story.id,
    interpretationId,
    headline: input.output.headline,
    body,
    supersedesVersionId: story.currentSummaryId,
    inputFingerprint: input.inputFingerprint,
  })
  await db.insert(schema.storySummarySource).values(
    citedArticles.map((articleId) => ({
      summaryVersionId: versionId,
      articleId,
      citation: citation.get(articleId) ?? null,
    })),
  )
  await db
    .update(schema.story)
    .set({
      currentSummaryId: versionId,
      title: input.output.headline,
      regions: [...new Set(input.output.regions)],
      desk: input.output.desk,
      publishedAt: story.publishedAt ?? new Date(),
    })
    .where(eq(schema.story.id, story.id))
  await touchStory(db, story.id, 'story.summary_updated')
  return { status: 'recorded', versionId }
}

/**
 * Human edit: creates a new version superseding the current one. `basedOnVersionId`
 * must be current (optimistic concurrency), so an edit never silently overwrites.
 */
export async function editSummary(
  db: Db,
  input: {
    storyId: string
    basedOnVersionId: string
    headline: string
    body: string
    userId: string
  },
) {
  const [story] = await db
    .select()
    .from(schema.story)
    .where(eq(schema.story.id, input.storyId))
    .for('update')
  if (!story) throw new DomainError('not_found', 'story not found')
  if (story.currentSummaryId !== input.basedOnVersionId) {
    throw new DomainError('conflict', 'summary changed since you started editing')
  }
  const [base] = await db
    .select()
    .from(schema.storySummaryVersion)
    .where(eq(schema.storySummaryVersion.id, input.basedOnVersionId))
  if (!base) throw new DomainError('not_found', 'base version not found')
  const sources = await db
    .select({
      articleId: schema.storySummarySource.articleId,
      citation: schema.storySummarySource.citation,
    })
    .from(schema.storySummarySource)
    .where(eq(schema.storySummarySource.summaryVersionId, base.id))
  const versionId = newId(ID_PREFIX.summaryVersion)
  await db.insert(schema.storySummaryVersion).values({
    id: versionId,
    storyId: story.id,
    headline: input.headline,
    body: input.body,
    format: base.format,
    supersedesVersionId: base.id,
    editedByUserId: input.userId,
    inputFingerprint: base.inputFingerprint,
  })
  if (sources.length > 0) {
    await db.insert(schema.storySummarySource).values(
      sources.map((s) => ({
        summaryVersionId: versionId,
        articleId: s.articleId,
        citation: s.citation,
      })),
    )
  }
  await db
    .update(schema.story)
    .set({ currentSummaryId: versionId, title: input.headline })
    .where(eq(schema.story.id, story.id))
  await touchStory(db, story.id, 'story.summary_edited')
  return versionId
}
