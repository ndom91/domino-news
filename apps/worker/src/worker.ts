import { startWorkers } from '@dn/jobs'
import { bootWorkerContext } from './boot.ts'

const ctx = await bootWorkerContext()
await startWorkers(ctx)
console.log(`[worker] started (inference=${ctx.inference.mode}, ingest=${ctx.config.ingestMode})`)

const shutdown = async () => {
  console.log('[worker] stopping')
  await ctx.workerBoss.stop({ graceful: true, timeout: 20_000 })
  await ctx.pool.end()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
