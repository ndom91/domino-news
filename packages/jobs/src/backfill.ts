import { schema } from '@dn/db'
import { type AnalysisJob, isBackfillPaused, PIPELINE_VERSION, PRIORITY, QUEUES } from '@dn/server'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import type { WorkerContext } from './context.ts'

const MAX_QUEUED_BACKFILL = 50

/**
 * Producer for backfill: admits a bounded number of older articles per run (cron, once a
 * minute) instead of enqueueing everything at once. Pausing stops admission; already
 * queued work drains through the single shared worker slot.
 */
export async function admitBackfill(ctx: WorkerContext) {
  if (await isBackfillPaused(ctx)) return { admitted: 0, paused: true }
  const [queue] = await ctx.workerBoss.getQueues([QUEUES.embedArticle])
  const room = Math.max(0, MAX_QUEUED_BACKFILL - (queue?.queuedCount ?? 0))
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
  for (const a of pending) {
    const job: AnalysisJob = {
      targetId: a.id,
      inputFingerprint: a.revisionId ?? '',
      pipelineVersion: PIPELINE_VERSION,
      priorityClass: 'backfill',
    }
    await ctx.workerBoss.send(QUEUES.embedArticle, job, {
      singletonKey: `${a.id}:${a.revisionId}:${PIPELINE_VERSION}`,
      priority: PRIORITY.backfill,
    })
    await ctx.db
      .update(schema.article)
      .set({ pipelineState: 'queued' })
      .where(eq(schema.article.id, a.id))
  }
  return { admitted: pending.length, paused: false }
}
