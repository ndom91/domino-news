import { type Db, schema } from '@dn/db'
import { ID_PREFIX, newId } from '@dn/domain'
import { PIPELINE_VERSION } from '@dn/server'
import { eq } from 'drizzle-orm'

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
    await db
      .update(schema.analysisRun)
      .set({ status: 'failed', completedAt: new Date(), error: String(error).slice(0, 500) })
      .where(eq(schema.analysisRun.id, runId))
    throw error
  }
}
