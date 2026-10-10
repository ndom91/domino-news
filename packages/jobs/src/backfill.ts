import { schema, withTransaction } from '@dn/db'
import { analysisJob, isBackfillPaused, QUEUES } from '@dn/server'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { sendInTx, type WorkerContext } from './context.ts'

const MAX_QUEUED_BACKFILL = 50

/**
 * Producer for backfill: admits a bounded number of older articles per run (cron, once a
 * minute) instead of enqueueing everything at once. Pausing stops admission; already
 * queued work drains through the single shared worker slot.
 */
export async function admitBackfill(ctx: WorkerContext) {
  if (await isBackfillPaused(ctx)) return { admitted: 0, paused: true }
  // Count the slower downstream stages too, so their backlog stays bounded as well.
  const queues = await ctx.workerBoss.getQueues([
    QUEUES.embedArticle,
    QUEUES.matchArticle,
    QUEUES.summarizeStory,
    QUEUES.generateContext,
  ])
  const queued = queues.reduce((sum, q) => sum + q.queuedCount, 0)
  const room = Math.max(0, MAX_QUEUED_BACKFILL - queued)
  const limit = Math.min(room, ctx.config.backfillAdmitPerMinute)
  if (limit === 0) return { admitted: 0, paused: false }

  // Newest first: recent backlog is more useful than the oldest items.
  const pending = await ctx.db
    .select({ id: schema.article.id, revisionId: schema.article.latestRevisionId })
    .from(schema.article)
    .where(
      and(
        eq(schema.article.pipelineState, 'pending_backfill'),
        isNotNull(schema.article.latestRevisionId),
      ),
    )
    .orderBy(desc(schema.article.publishedAt))
    .limit(limit)
  let count = 0
  for (const a of pending) {
    const job = analysisJob(a.id, a.revisionId ?? '', 'backfill')
    // Admit only if ingest hasn't revised the article since we read it; job and state commit together.
    const admitted = await withTransaction(ctx.pool, async (tx) => {
      const updated = await tx.db
        .update(schema.article)
        .set({ pipelineState: 'queued' })
        .where(
          and(
            eq(schema.article.id, a.id),
            eq(schema.article.pipelineState, 'pending_backfill'),
            eq(schema.article.latestRevisionId, a.revisionId ?? ''),
          ),
        )
        .returning({ id: schema.article.id })
      if (updated.length === 0) return false
      await sendInTx(ctx, tx, QUEUES.embedArticle, job.data, job.options)
      return true
    })
    if (admitted) count++
  }
  return { admitted: count, paused: false }
}
