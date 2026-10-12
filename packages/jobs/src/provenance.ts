import { type Db, schema } from '@dn/db'
import { ID_PREFIX, newId } from '@dn/domain'
import { type AnalysisJob, PIPELINE_VERSION } from '@dn/server'
import { eq } from 'drizzle-orm'
import type { WorkerContext } from './context.ts'

/** Records an AnalysisRun around an inference call; failures are kept for inspection. */
export async function withAnalysisRun<T extends { modelId: string; promptVersion: string }>(
  db: Db,
  meta: {
    operation: string
    targetType: string
    targetId: string
    inputFingerprint: string
    modelId: string
  },
  fn: () => Promise<T>,
): Promise<{ runId: string; result: T }> {
  const runId = newId(ID_PREFIX.analysisRun)
  await db.insert(schema.analysisRun).values({
    id: runId,
    operation: meta.operation,
    modelId: meta.modelId,
    promptVersion: 'pending',
    pipelineVersion: PIPELINE_VERSION,
    inputFingerprint: meta.inputFingerprint,
    targetType: meta.targetType,
    targetId: meta.targetId,
    startedAt: new Date(),
    status: 'running',
  })
  try {
    const result = await fn()
    await db
      .update(schema.analysisRun)
      .set({
        status: 'succeeded',
        completedAt: new Date(),
        modelId: result.modelId,
        promptVersion: result.promptVersion,
      })
      .where(eq(schema.analysisRun.id, runId))
    return { runId, result }
  } catch (error) {
    await markRunFailed(db, runId, error)
    throw error
  }
}

/** For output rejected after the call returned (e.g. ungrounded citations). */
export async function markRunFailed(db: Db, runId: string, error: unknown) {
  await db
    .update(schema.analysisRun)
    .set({ status: 'failed', completedAt: new Date(), error: String(error).slice(0, 500) })
    .where(eq(schema.analysisRun.id, runId))
}

/** A generation call about one Story: queued on the GPU at the job's priority and recorded. */
export function runStoryGeneration<T extends { modelId: string; promptVersion: string }>(
  ctx: WorkerContext,
  job: AnalysisJob,
  run: { operation: string; storyId: string; inputFingerprint: string },
  fn: () => Promise<T>,
) {
  return withAnalysisRun(
    ctx.db,
    {
      operation: run.operation,
      targetType: 'story',
      targetId: run.storyId,
      inputFingerprint: run.inputFingerprint,
      modelId: ctx.inference.generation.modelId,
    },
    () => ctx.gpu.generation.run(job.priorityClass, fn),
  )
}

/** Locks the Story row (call inside a transaction): is `summaryId` still its current summary? */
export async function lockCurrentSummary(db: Db, storyId: string, summaryId: string) {
  const [current] = await db
    .select({ summaryId: schema.story.currentSummaryId })
    .from(schema.story)
    .where(eq(schema.story.id, storyId))
    .for('update')
  return current?.summaryId === summaryId
}
