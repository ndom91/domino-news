import { type Db, schema, withTransaction } from '@dn/db'
import { ID_PREFIX, newId } from '@dn/domain'
import { InferenceUnavailableError, InvalidModelOutputError } from '@dn/inference'
import {
  type AnalysisJob,
  attachArticleToStory,
  createStoryWithArticle,
  refreshFingerprint,
} from '@dn/server'
import { and, cosineDistance, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { WorkerContext } from './context.ts'
import { loadArticles, loadStoryInput } from './inputs.ts'
import { admitMatchFollower } from './match-admission.ts'
import { decideMatch, type MatchPolicy, rankStories } from './match-core.ts'
import { withAnalysisRun } from './provenance.ts'
import { debounceStorySummary } from './summary-debounce.ts'

// Cosine-similarity bands. `autoSame` also controls follower admission; fixture matching
// uses it for automatic attachment, while local matching always asks the model. Below
// `llmMin` the article starts a new Story. Fixture vectors have a different scale.
export const THRESHOLDS = {
  fixture: { autoSame: 0.75, llmMin: 0.2, relateMin: 0.12 },
  local: { autoSame: 0.93, llmMin: 0.72, relateMin: 0.6 },
} as const

export const CANDIDATE_WINDOW_SECONDS = 4 * 86_400
export const NEIGHBOURS = 12
const MAX_LLM_CANDIDATES = 5

/**
 * The policy production runs with. Chosen on the match evaluation set (docs/006): judging all
 * candidates side by side and anchoring stories on their first reports raised F1 from about
 * 77% to 83–84% and cut model calls by 40%.
 */
export function matchPolicy(mode: keyof typeof THRESHOLDS): MatchPolicy {
  const t = THRESHOLDS[mode]
  return {
    // A close neighbour can itself be an unrelated article in a mixed Story. Do not
    // let its similarity propagate the mistake without checking the Story's anchors.
    autoSame: mode === 'local' ? Number.POSITIVE_INFINITY : t.autoSame,
    llmMin: t.llmMin,
    maxCandidates: MAX_LLM_CANDIDATES,
  }
}

export class CandidatesChangedError extends Error {}

export function acceptsStoryDecision(
  output: { storyId: string | null; confidence: number },
  threshold: number,
) {
  return output.storyId !== null && output.confidence >= threshold
}

/** Best similarity per Story among the neighbours, using canonical membership from Postgres. */
async function rankCandidateStories(
  db: Db,
  neighbours: { articleId: string; similarity: number }[],
  minSimilarity: number,
) {
  if (neighbours.length === 0) return []
  const memberships = await db
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
  const storyOf = new Map(memberships.map((m) => [m.articleId, m.storyId]))
  return rankStories(neighbours, (id) => storyOf.get(id), minSimilarity)
}

/** The nearest embedded articles reported within the candidate window around `at` (exact). */
async function similarArticles(db: Db, articleId: string, embedding: number[], at: Date) {
  const windowMs = CANDIDATE_WINDOW_SECONDS * 1000
  const distance = cosineDistance(schema.articleEmbedding.embedding, embedding)
  // Matches article_reported_at_idx.
  const reportedAt = sql`coalesce(${schema.article.publishedAt}, ${schema.article.firstSeenAt})`
  const rows = await db
    .select({ articleId: schema.articleEmbedding.articleId, distance })
    .from(schema.articleEmbedding)
    .innerJoin(schema.article, eq(schema.article.id, schema.articleEmbedding.articleId))
    .where(
      and(
        ne(schema.article.id, articleId),
        sql`${reportedAt} between ${new Date(at.getTime() - windowMs)} and ${new Date(at.getTime() + windowMs)}`,
      ),
    )
    .orderBy(distance)
    .limit(NEIGHBOURS)
  return rows.map((r) => ({ articleId: r.articleId, similarity: 1 - Number(r.distance) }))
}

/**
 * Conservative Story assignment for one article. Jobs run concurrently; the final write
 * takes an advisory lock and re-checks candidates, so two near-identical articles cannot
 * both create a Story.
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
      await debounceStorySummary(ctx, tx, existing.storyId, job.priorityClass)
    })
    return { status: 'already_matched', storyId: existing.storyId }
  }

  const thresholds = THRESHOLDS[ctx.inference.mode]
  const policy = matchPolicy(ctx.inference.mode)
  const at = row.article.publishedAt ?? row.article.firstSeenAt
  const neighbours = await similarArticles(ctx.db, job.targetId, row.embedding.embedding, at)
  const ranked = await rankCandidateStories(ctx.db, neighbours, thresholds.llmMin)

  const [top] = ranked
  // The model needs the article only when the embedding alone doesn't decide.
  const needsModel = !top || top[1] < policy.autoSame
  if (needsModel) {
    const admission = await admitMatchFollower(ctx, job, neighbours, thresholds.autoSame)
    if (admission) {
      return {
        status: 'deferred',
        leaderArticleId: admission.leaderArticleId,
        until: admission.expiresAt.toISOString(),
      }
    }
  }
  const articleInput = needsModel ? (await loadArticles(ctx.db, [job.targetId]))[0] : null
  if (needsModel && !articleInput) return { status: 'stale' }
  const decision = await decideMatch(ranked, policy, async (storyIds) => {
    const stories = (
      await Promise.all(storyIds.map((id) => loadStoryInput(ctx.db, id, { matching: true })))
    ).filter((s) => s !== null)
    if (!articleInput || stories.length === 0) return { storyId: null }
    const decisionProvider = ctx.inference.decision
    if (decisionProvider) {
      try {
        const { runId, result } = await withAnalysisRun(
          ctx.db,
          {
            operation: 'story_match',
            targetType: 'article',
            targetId: job.targetId,
            inputFingerprint: `${job.inputFingerprint}|decision|${storyIds.join(',')}`,
            modelId: decisionProvider.modelId,
          },
          () =>
            ctx.gpu.generation.run(job.priorityClass, () =>
              decisionProvider.chooseStory({ article: articleInput, stories }),
            ),
        )
        await recordMatchInterpretation(
          ctx,
          runId,
          job.targetId,
          articleInput.observationId,
          result.output,
        )
        if (acceptsStoryDecision(result.output, ctx.config.matchDecisionConfidence)) {
          return { storyId: result.output.storyId, runId }
        }
      } catch (error) {
        if (
          !(error instanceof InferenceUnavailableError || error instanceof InvalidModelOutputError)
        ) {
          throw error
        }
      }
    }
    const { runId, result } = await withAnalysisRun(
      ctx.db,
      {
        operation: 'story_match',
        targetType: 'article',
        targetId: job.targetId,
        inputFingerprint: `${job.inputFingerprint}|${storyIds.join(',')}`,
        modelId: ctx.inference.generation.modelId,
      },
      () =>
        ctx.gpu.generation.run(job.priorityClass, () =>
          ctx.inference.generation.chooseStory({ article: articleInput, stories }),
        ),
    )
    await recordMatchInterpretation(
      ctx,
      runId,
      job.targetId,
      articleInput.observationId,
      result.output,
    )
    return { storyId: result.output.storyId, runId }
  })

  // Model calls above run concurrently across jobs; the write below is serialised.
  const storyId = await withTransaction(ctx.pool, async (tx) => {
    await tx.client.query(`select pg_advisory_xact_lock(hashtext('dn:story-matching'))`)
    const [alreadyIn] = await tx.db
      .select({ storyId: schema.storyArticle.storyId })
      .from(schema.storyArticle)
      .where(
        and(eq(schema.storyArticle.articleId, job.targetId), isNull(schema.storyArticle.removedAt)),
      )
    if (alreadyIn) return alreadyIn.storyId
    // A neighbour may have joined a Story we never evaluated while the model was running.
    // Re-run with full information rather than risk a duplicate Story.
    const considered = new Set(ranked.map(([id]) => id))
    const current = await rankCandidateStories(tx.db, neighbours, thresholds.llmMin)
    if (current.some(([id]) => !considered.has(id))) {
      throw new CandidatesChangedError(`candidate stories changed for ${job.targetId}; retrying`)
    }
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
    await debounceStorySummary(ctx, tx, id, job.priorityClass)
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
