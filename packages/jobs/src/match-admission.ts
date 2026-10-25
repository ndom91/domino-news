import { schema, withTransaction } from '@dn/db'
import { type AnalysisJob, analysisJob, PIPELINE_VERSION, QUEUES } from '@dn/server'
import { and, eq, inArray, isNull, lte } from 'drizzle-orm'
import { sendInTx, type WorkerContext } from './context.ts'

export const MATCH_ADMISSION_SECONDS = 45
export const MATCH_ADMISSION_CLUSTER_SECONDS = 2 * 60
export class MatchLeaderPendingError extends Error {}

export function electMatchLeader(
  currentArticleId: string,
  candidates: {
    id: string
    at: Date | null
    firstSeenAt: Date
    storyId: string | null
  }[],
) {
  const current = candidates.find((candidate) => candidate.id === currentArticleId)
  if (!current) return null
  return (
    candidates
      .filter(
        (candidate) =>
          candidate.storyId === null &&
          Math.abs(candidate.firstSeenAt.getTime() - current.firstSeenAt.getTime()) <=
            MATCH_ADMISSION_CLUSTER_SECONDS * 1000,
      )
      .sort(
        (a, b) =>
          (a.at ?? a.firstSeenAt).getTime() - (b.at ?? b.firstSeenAt).getTime() ||
          a.id.localeCompare(b.id),
      )[0] ?? null
  )
}

/**
 * Elect the oldest very-close unmatched article as the inference leader. Followers never
 * attach here: they wait for the leader, then run the normal matcher against its Story.
 */
export async function admitMatchFollower(
  ctx: WorkerContext,
  job: AnalysisJob,
  neighbours: { articleId: string; similarity: number }[],
  similarity: number,
) {
  const closeIds = neighbours
    .filter((candidate) => candidate.similarity >= similarity)
    .map((candidate) => candidate.articleId)
  if (closeIds.length === 0) return null
  return withTransaction(ctx.pool, async (tx) => {
    await tx.client.query(`select pg_advisory_xact_lock(hashtext('dn:match-admission'))`)
    const now = new Date()
    const candidates = await tx.db
      .select({
        id: schema.article.id,
        at: schema.article.publishedAt,
        firstSeenAt: schema.article.firstSeenAt,
        storyId: schema.storyArticle.storyId,
      })
      .from(schema.article)
      .leftJoin(
        schema.storyArticle,
        and(
          eq(schema.storyArticle.articleId, schema.article.id),
          isNull(schema.storyArticle.removedAt),
        ),
      )
      .where(
        and(
          inArray(schema.article.id, [job.targetId, ...closeIds]),
          eq(schema.article.pipelineState, 'embedded'),
        ),
      )
    const leader = electMatchLeader(job.targetId, candidates)
    if (!leader || leader.id === job.targetId) return null
    const expiresAt = new Date(now.getTime() + MATCH_ADMISSION_SECONDS * 1000)
    await tx.db
      .insert(schema.matchAdmission)
      .values({
        articleId: job.targetId,
        leaderArticleId: leader.id,
        inputFingerprint: job.inputFingerprint,
        priorityClass: job.priorityClass,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: schema.matchAdmission.articleId,
        set: {
          leaderArticleId: leader.id,
          inputFingerprint: job.inputFingerprint,
          priorityClass: job.priorityClass,
          expiresAt,
        },
      })
    const resume = analysisJob(job.targetId, job.inputFingerprint, job.priorityClass)
    await sendInTx(ctx, tx, QUEUES.resumeMatchArticle, resume.data, {
      ...resume.options,
      startAfter: 3,
    })
    return { leaderArticleId: leader.id, expiresAt }
  })
}

/** Resume a follower after its leader matched, or after the lease expired/leader disappeared. */
export async function resumeMatchFollower(ctx: WorkerContext, job: AnalysisJob) {
  return withTransaction(ctx.pool, async (tx) => {
    const [lease] = await tx.db
      .select({
        leaderArticleId: schema.matchAdmission.leaderArticleId,
        inputFingerprint: schema.matchAdmission.inputFingerprint,
        priorityClass: schema.matchAdmission.priorityClass,
        expiresAt: schema.matchAdmission.expiresAt,
        leaderStoryId: schema.storyArticle.storyId,
      })
      .from(schema.matchAdmission)
      .leftJoin(
        schema.storyArticle,
        and(
          eq(schema.storyArticle.articleId, schema.matchAdmission.leaderArticleId),
          isNull(schema.storyArticle.removedAt),
        ),
      )
      .where(eq(schema.matchAdmission.articleId, job.targetId))
    if (!lease) return { status: 'already_released' }
    const ready = lease.leaderStoryId !== null || lease.expiresAt <= new Date()
    if (!ready) {
      throw new MatchLeaderPendingError(`leader ${lease.leaderArticleId} is still matching`)
    }
    await tx.db
      .delete(schema.matchAdmission)
      .where(eq(schema.matchAdmission.articleId, job.targetId))
    const next = analysisJob(
      job.targetId,
      lease.inputFingerprint ?? job.inputFingerprint,
      (lease.priorityClass as AnalysisJob['priorityClass'] | null) ?? job.priorityClass,
    )
    await sendInTx(ctx, tx, QUEUES.matchArticle, next.data, next.options)
    return {
      status: lease.leaderStoryId ? 'leader_matched' : 'lease_expired',
      leaderArticleId: lease.leaderArticleId,
    }
  })
}

/** Recover expired followers even when their original resume job was lost or exhausted. */
export async function reconcileMatchAdmissions(ctx: WorkerContext, limit = 100) {
  const expired = await ctx.db
    .select({
      articleId: schema.matchAdmission.articleId,
      inputFingerprint: schema.matchAdmission.inputFingerprint,
      priorityClass: schema.matchAdmission.priorityClass,
    })
    .from(schema.matchAdmission)
    .where(lte(schema.matchAdmission.expiresAt, new Date()))
    .limit(limit)
  for (const row of expired) {
    await resumeMatchFollower(ctx, {
      targetId: row.articleId,
      inputFingerprint: row.inputFingerprint,
      priorityClass: row.priorityClass as AnalysisJob['priorityClass'],
      pipelineVersion: PIPELINE_VERSION,
    })
  }
  return expired.length
}
