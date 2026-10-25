import { schema, type TxContext, withTransaction } from '@dn/db'
import { type AnalysisJob, analysisJob, getInferenceSettings, QUEUES } from '@dn/server'
import { asc, eq, lte } from 'drizzle-orm'
import { sendInTx, type WorkerContext } from './context.ts'

const INITIAL_SUMMARY_DEBOUNCE_SECONDS = 5

const higherPriority = (
  current: AnalysisJob['priorityClass'],
  incoming: AnalysisJob['priorityClass'],
) => {
  const rank: Record<AnalysisJob['priorityClass'], number> = {
    backfill: 0,
    fresh: 1,
    interactive: 2,
  }
  return rank[incoming] > rank[current] ? incoming : current
}

/** Record the latest desired Story fingerprint and start one durable debounce wake-up. */
export async function debounceStorySummary(
  ctx: WorkerContext,
  tx: TxContext,
  storyId: string,
  priorityClass: AnalysisJob['priorityClass'],
) {
  await lockSummaryDebounce(tx, storyId)
  const [story] = await tx.db
    .select({ fingerprint: schema.story.inputFingerprint, publishedAt: schema.story.publishedAt })
    .from(schema.story)
    .where(eq(schema.story.id, storyId))
  if (!story?.fingerprint) return { status: 'missing' as const }
  const job = analysisJob(storyId, story.fingerprint, priorityClass)
  if (priorityClass === 'interactive') {
    await tx.db.delete(schema.summaryDebounce).where(eq(schema.summaryDebounce.storyId, storyId))
    await sendInTx(ctx, tx, QUEUES.summarizeStory, job.data, job.options)
    return { status: 'immediate' as const }
  }
  const { publishedSummaryDebounceSeconds } = await getInferenceSettings({
    config: ctx.config,
    db: tx.db,
  })
  const delay = story.publishedAt
    ? publishedSummaryDebounceSeconds
    : INITIAL_SUMMARY_DEBOUNCE_SECONDS
  const dueAt = new Date(Date.now() + delay * 1000)
  const [pending] = await tx.db
    .select()
    .from(schema.summaryDebounce)
    .where(eq(schema.summaryDebounce.storyId, storyId))
    .for('update')
  if (pending) {
    await tx.db
      .update(schema.summaryDebounce)
      .set({
        inputFingerprint: story.fingerprint,
        priorityClass: higherPriority(
          pending.priorityClass as AnalysisJob['priorityClass'],
          priorityClass,
        ),
        dueAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.summaryDebounce.storyId, storyId))
    return { status: 'extended' as const, dueAt }
  }
  await tx.db.insert(schema.summaryDebounce).values({
    storyId,
    inputFingerprint: story.fingerprint,
    priorityClass,
    dueAt,
  })
  await sendDebounceWake(ctx, tx, job, dueAt)
  return { status: 'scheduled' as const, dueAt }
}

/** Release the latest fingerprint after the Story has stayed quiet until its due time. */
export async function releaseSummaryDebounce(ctx: WorkerContext, job: AnalysisJob) {
  return withTransaction(ctx.pool, async (tx) => {
    await lockSummaryDebounce(tx, job.targetId)
    const [pending] = await tx.db
      .select()
      .from(schema.summaryDebounce)
      .where(eq(schema.summaryDebounce.storyId, job.targetId))
      .for('update')
    if (!pending) return { status: 'already_released' as const }
    const now = new Date()
    const next = analysisJob(
      pending.storyId,
      pending.inputFingerprint,
      pending.priorityClass as AnalysisJob['priorityClass'],
    )
    if (pending.dueAt > now) {
      await sendDebounceWake(ctx, tx, next, pending.dueAt)
      return { status: 'rescheduled' as const, dueAt: pending.dueAt }
    }
    await tx.db
      .delete(schema.summaryDebounce)
      .where(eq(schema.summaryDebounce.storyId, pending.storyId))
    await sendInTx(ctx, tx, QUEUES.summarizeStory, next.data, next.options)
    return { status: 'released' as const, inputFingerprint: pending.inputFingerprint }
  })
}

async function lockSummaryDebounce(tx: TxContext, storyId: string) {
  await tx.client.query('select pg_advisory_xact_lock(hashtext($1))', [
    `dn:summary-debounce:${storyId}`,
  ])
}

async function sendDebounceWake(
  ctx: WorkerContext,
  tx: TxContext,
  job: ReturnType<typeof analysisJob>,
  dueAt: Date,
) {
  const id = await sendInTx(ctx, tx, QUEUES.releaseSummaryDebounce, job.data, {
    ...job.options,
    singletonKey: `${job.data.targetId}:${dueAt.getTime()}`,
    startAfter: Math.max(1, Math.ceil((dueAt.getTime() - Date.now()) / 1000)),
  })
  if (!id) throw new Error(`summary debounce wake already active for ${job.data.targetId}`)
}

/** Recover due debounce rows whose wake-up job was lost or exhausted. */
export async function reconcileSummaryDebounces(ctx: WorkerContext, limit = 100) {
  const due = await ctx.db
    .select()
    .from(schema.summaryDebounce)
    .where(lte(schema.summaryDebounce.dueAt, new Date()))
    .orderBy(asc(schema.summaryDebounce.dueAt))
    .limit(limit)
  let admitted = 0
  for (const row of due) {
    const job = analysisJob(
      row.storyId,
      row.inputFingerprint,
      row.priorityClass as AnalysisJob['priorityClass'],
    )
    const id = await ctx.workerBoss.send(QUEUES.releaseSummaryDebounce, job.data, {
      ...job.options,
      singletonKey: `${row.storyId}:${row.dueAt.getTime()}`,
    })
    if (id) admitted++
  }
  return admitted
}
