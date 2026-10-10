import { schema, withTransaction } from '@dn/db'
import { ID_PREFIX, newId } from '@dn/domain'
import {
  type AnalysisJob,
  attachArticleToStory,
  createStoryWithArticle,
  PIPELINE_VERSION,
  PRIORITY,
  QUEUES,
  refreshFingerprint,
} from '@dn/server'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { sendInTx, type WorkerContext } from './context.ts'
import { loadArticles, loadStoryInput } from './inputs.ts'
import { withAnalysisRun } from './provenance.ts'

// Cosine-similarity bands. Above `autoSame` we attach without asking the model; between
// `llmMin` and `autoSame` the model decides; below `llmMin` the article starts a new Story.
// Fixture vectors are bag-of-words hashes, so their scale differs from EmbeddingGemma's.
export const THRESHOLDS = {
  fixture: { autoSame: 0.75, llmMin: 0.2, relateMin: 0.12 },
  local: { autoSame: 0.93, llmMin: 0.72, relateMin: 0.6 },
} as const

const CANDIDATE_WINDOW_SECONDS = 4 * 86_400
const MAX_LLM_CANDIDATES = 3

export class NotIndexedYetError extends Error {}

interface VectorHit {
  document: { id: string }
  vector_distance?: number
}

async function similarArticles(
  ctx: WorkerContext,
  articleId: string,
  embedding: number[],
  at: Date,
) {
  const t = Math.floor(at.getTime() / 1000)
  const { results } = await ctx.ts.multiSearch<{ hits?: VectorHit[] }>([
    {
      collection: 'articles',
      q: '*',
      vector_query: `embedding:([${embedding.join(',')}], k:12)`,
      filter_by: `id:!=${articleId} && published_at:>=${t - CANDIDATE_WINDOW_SECONDS} && published_at:<=${t + CANDIDATE_WINDOW_SECONDS}`,
      exclude_fields: 'embedding',
      per_page: 12,
    },
  ])
  return (results[0]?.hits ?? []).map((h) => ({
    articleId: h.document.id,
    similarity: 1 - (h.vector_distance ?? 1),
  }))
}

/**
 * Conservative Story assignment for one article. Runs with concurrency 1 so two
 * near-identical articles cannot both create a Story at the same moment.
 */
export async function matchArticle(ctx: WorkerContext, job: AnalysisJob) {
  const [row] = await ctx.db
    .select({ article: schema.article, embedding: schema.articleEmbedding })
    .from(schema.article)
    .innerJoin(schema.articleEmbedding, eq(schema.articleEmbedding.articleId, schema.article.id))
    .where(eq(schema.article.id, job.targetId))
  if (!row || row.article.latestRevisionId !== job.inputFingerprint) return { status: 'stale' }

  // Already in a Story (e.g. a headline revision): the Story's inputs changed, re-summarise.
  const [existing] = await ctx.db
    .select({ storyId: schema.storyArticle.storyId })
    .from(schema.storyArticle)
    .where(
      and(eq(schema.storyArticle.articleId, job.targetId), isNull(schema.storyArticle.removedAt)),
    )
  if (existing) {
    await withTransaction(ctx.pool, async (tx) => {
      await tx.db
        .update(schema.article)
        .set({ pipelineState: 'matched' })
        .where(eq(schema.article.id, job.targetId))
      await refreshFingerprint(tx.db, existing.storyId)
      await enqueueSummary(ctx, tx, existing.storyId, job.priorityClass)
    })
    return { status: 'already_matched', storyId: existing.storyId }
  }

  const [projected] = await ctx.db
    .select()
    .from(schema.searchProjectionState)
    .where(
      and(
        eq(schema.searchProjectionState.aggregateType, 'article'),
        eq(schema.searchProjectionState.aggregateId, job.targetId),
      ),
    )
  if (!projected || projected.deleted)
    throw new NotIndexedYetError(`article ${job.targetId} not indexed yet`)

  const thresholds = THRESHOLDS[ctx.inference.mode]
  const at = row.article.publishedAt ?? row.article.firstSeenAt
  const neighbours = await similarArticles(ctx, job.targetId, row.embedding.embedding, at)

  // Best similarity per Story, using canonical membership from Postgres.
  const memberships = neighbours.length
    ? await ctx.db
        .select({ articleId: schema.storyArticle.articleId, storyId: schema.storyArticle.storyId })
        .from(schema.storyArticle)
        .where(
          and(
            inArray(
              schema.storyArticle.articleId,
              neighbours.map((n) => n.articleId),
            ),
            isNull(schema.storyArticle.removedAt),
          ),
        )
    : []
  const bestByStory = new Map<string, number>()
  for (const n of neighbours) {
    const storyId = memberships.find((m) => m.articleId === n.articleId)?.storyId
    if (storyId) bestByStory.set(storyId, Math.max(bestByStory.get(storyId) ?? 0, n.similarity))
  }
  const ranked = [...bestByStory.entries()]
    .filter(([, s]) => s >= thresholds.llmMin)
    .sort((a, b) => b[1] - a[1])

  let decision: { storyId: string; similarity: number; method: string; runId?: string } | null =
    null
  const [top] = ranked
  if (top && top[1] >= thresholds.autoSame) {
    decision = { storyId: top[0], similarity: top[1], method: 'embedding' }
  } else {
    const [articleInput] = await loadArticles(ctx.db, [job.targetId])
    if (!articleInput) return { status: 'stale' }
    for (const [storyId, similarity] of ranked.slice(0, MAX_LLM_CANDIDATES)) {
      const story = await loadStoryInput(ctx.db, storyId)
      if (!story) continue
      const { runId, result } = await withAnalysisRun(
        ctx.db,
        {
          operation: 'story_match',
          targetType: 'article',
          targetId: job.targetId,
          inputFingerprint: `${job.inputFingerprint}|${storyId}`,
          modelId: ctx.inference.generation.modelId,
        },
        () =>
          ctx.gpu.generation.run(job.priorityClass, () =>
            ctx.inference.generation.matchStory({ article: articleInput, story }),
          ),
      )
      await recordMatchInterpretation(
        ctx,
        runId,
        job.targetId,
        articleInput.observationId,
        result.output,
      )
      if (result.output.decision === 'same_development') {
        decision = { storyId, similarity, method: 'llm', runId }
        break
      }
    }
  }

  const storyId = await withTransaction(ctx.pool, async (tx) => {
    const [articleRow] = await loadArticles(tx.db, [job.targetId])
    if (!articleRow) throw new Error('article vanished')
    let id: string
    if (decision) {
      await attachArticleToStory(tx.db, {
        storyId: decision.storyId,
        articleId: job.targetId,
        observedAt: at,
        confidence: decision.similarity,
        analysisRunId: decision.runId,
        matchMethod: decision.method,
      })
      id = decision.storyId
    } else {
      id = await createStoryWithArticle(tx.db, {
        articleId: job.targetId,
        title: articleRow.title,
        observedAt: at,
        matchMethod: 'new_story',
      })
    }
    await tx.db
      .update(schema.article)
      .set({ pipelineState: 'matched' })
      .where(eq(schema.article.id, job.targetId))
    await enqueueSummary(ctx, tx, id, job.priorityClass)
    return id
  })
  return {
    status: decision ? 'attached' : 'new_story',
    storyId,
    method: decision?.method,
    bestSimilarity: top ? Number(top[1].toFixed(3)) : null,
    candidates: ranked.length,
  }
}

async function recordMatchInterpretation(
  ctx: WorkerContext,
  runId: string,
  articleId: string,
  observationId: string,
  output: object,
) {
  const id = newId(ID_PREFIX.interpretation)
  await ctx.db.insert(schema.interpretation).values({
    id,
    type: 'story_match',
    subjectType: 'article',
    subjectId: articleId,
    output: output as Record<string, unknown>,
    analysisRunId: runId,
  })
  await ctx.db.insert(schema.interpretationEvidence).values({
    interpretationId: id,
    observationId,
    relationship: 'derived_from',
  })
}

export async function enqueueSummary(
  ctx: WorkerContext,
  tx: Parameters<typeof sendInTx>[1],
  storyId: string,
  priorityClass: AnalysisJob['priorityClass'],
) {
  const [story] = await tx.db
    .select({
      fingerprint: schema.story.inputFingerprint,
      lastUpdatedAt: schema.story.lastUpdatedAt,
    })
    .from(schema.story)
    .where(eq(schema.story.id, storyId))
  if (!story?.fingerprint) return
  const job: AnalysisJob = {
    targetId: storyId,
    inputFingerprint: story.fingerprint,
    pipelineVersion: PIPELINE_VERSION,
    priorityClass,
  }
  await sendInTx(ctx, tx, QUEUES.summarizeStory, job, {
    singletonKey: `${storyId}:${story.fingerprint}:${PIPELINE_VERSION}`,
    priority: PRIORITY[priorityClass],
    // Short delay lets sibling articles from the same poll land before summarising.
    startAfter: 5,
  })
}
