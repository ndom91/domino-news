import { PriorityLimiter, type WorkerContext } from '@dn/jobs'
import { createServerContext, ensureCollections } from '@dn/server'
import { PgBoss } from 'pg-boss'

// The worker and CLI cwd is apps/worker under pnpm; fixtures live at the repo root.
process.env.FIXTURE_DIR ??= new URL('../../../fixtures', import.meta.url).pathname

export async function bootWorkerContext(): Promise<WorkerContext> {
  const ctx = createServerContext()
  const workerBoss = new PgBoss({ connectionString: ctx.config.databaseUrl, max: 6 })
  workerBoss.on('error', (error) => console.error('[pg-boss]', String(error)))
  await workerBoss.start()
  await ensureCollections(ctx.ts)
  return {
    ...ctx,
    boss: async () => workerBoss,
    workerBoss,
    gpu: {
      embeddings: new PriorityLimiter(ctx.config.embeddingConcurrency),
      generation: new PriorityLimiter(ctx.config.generationConcurrency),
    },
  }
}
