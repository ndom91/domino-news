import { type Db, schema } from '@dn/db'
import type { ArticleInput, StoryInput } from '@dn/inference'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { type MatchPolicy, storyArticlesShown } from './match-core.ts'
import { fetchTransientArticle } from './transient-body.ts'

export interface LoadedArticle extends ArticleInput {
  url: string
  bodyPolicy: 'metadata_only' | 'transient_body_allowed'
  firstSeenAt: Date
  revisionId: string
}

/** Current metadata for articles, plus the observation backing their latest revision. */
export async function loadArticles(db: Db, articleIds: string[]): Promise<LoadedArticle[]> {
  if (articleIds.length === 0) return []
  const rows = await db
    .select({
      id: schema.article.id,
      url: schema.article.canonicalUrl,
      publishedAt: schema.article.publishedAt,
      firstSeenAt: schema.article.firstSeenAt,
      revisionId: schema.article.latestRevisionId,
      title: schema.articleRevision.title,
      description: schema.articleRevision.description,
      publisher: schema.publisher.name,
      publisherCountry: schema.publisher.countryCode,
      publisherKind: schema.publisher.kind,
      bodyPolicy: schema.publisher.articleBodyPolicy,
      observationId: schema.observation.id,
    })
    .from(schema.article)
    .innerJoin(
      schema.articleRevision,
      eq(schema.articleRevision.id, schema.article.latestRevisionId),
    )
    .innerJoin(schema.publisher, eq(schema.publisher.id, schema.article.publisherId))
    .innerJoin(
      schema.observation,
      and(
        eq(schema.observation.subjectType, 'article'),
        eq(schema.observation.subjectId, schema.article.id),
        sql`${schema.observation.payload}->>'revisionId' = ${schema.article.latestRevisionId}`,
      ),
    )
    .where(inArray(schema.article.id, articleIds))
  return rows.map((r) => ({
    articleId: r.id,
    observationId: r.observationId,
    publisher: r.publisher,
    publisherCountry: r.publisherCountry,
    publisherKind: r.publisherKind,
    title: r.title,
    description: r.description,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    url: r.url,
    bodyPolicy: r.bodyPolicy,
    firstSeenAt: r.firstSeenAt,
    revisionId: r.revisionId ?? '',
  }))
}

export async function loadStoryInput(
  db: Db,
  storyId: string,
  // matching: which articles a big story shows (see storyArticlesShown). max: only the
  // newest few, e.g. for narrative titles.
  opts: { matching?: MatchPolicy['storyArticles']; max?: number } = {},
): Promise<StoryInput | null> {
  const [story] = await db
    .select({
      id: schema.story.id,
      title: schema.story.title,
      firstObservedAt: schema.story.firstObservedAt,
      summary: schema.storySummaryVersion.body,
    })
    .from(schema.story)
    .leftJoin(
      schema.storySummaryVersion,
      eq(schema.storySummaryVersion.id, schema.story.currentSummaryId),
    )
    .where(eq(schema.story.id, storyId))
  if (!story) return null
  const links = await db
    .select({ articleId: schema.storyArticle.articleId })
    .from(schema.storyArticle)
    .where(and(eq(schema.storyArticle.storyId, storyId), isNull(schema.storyArticle.removedAt)))
  const oldestFirst = (
    await loadArticles(
      db,
      links.map((l) => l.articleId),
    )
  ).sort((a, b) => (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''))
  // Summaries keep the newest reports so new sources can be summarised and cited.
  const articles = opts.max
    ? oldestFirst.slice(-opts.max)
    : storyArticlesShown(oldestFirst, opts.matching ?? 'newest')
  // For matching, a story is what its first report says, not its latest title or summary:
  // those widen as the story grows and pull in neighbouring developments (match evaluation).
  if (opts.matching) {
    const [first] = oldestFirst
    return {
      storyId: story.id,
      title: first?.title ?? story.title,
      summary: null,
      firstObservedAt: story.firstObservedAt.toISOString(),
      articles,
    }
  }
  return {
    storyId: story.id,
    title: story.title,
    summary: story.summary,
    firstObservedAt: story.firstObservedAt.toISOString(),
    articles,
  }
}

/**
 * Attach transient bodies where publisher policy allows. Bodies live only in this
 * in-memory object for the duration of one inference call.
 */
export async function withTransientBodies(story: StoryInput) {
  const primaryLinks = new Map<string, string[]>()
  const articles = await Promise.all(
    (story.articles as LoadedArticle[]).map(async (a) => {
      if (a.bodyPolicy !== 'transient_body_allowed') return a
      const fetched = await fetchTransientArticle(a.url)
      if (!fetched) return a
      primaryLinks.set(a.articleId, fetched.primaryLinks)
      return { ...a, body: fetched.body }
    }),
  )
  return { story: { ...story, articles }, primaryLinks }
}
