import { runIndexerLoop } from '@dn/jobs'
import { createServerContext, ensureCollections } from '@dn/server'

const ctx = createServerContext()
await ensureCollections(ctx.ts)
const controller = new AbortController()
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => controller.abort())
}
console.log('[indexer] started')
await runIndexerLoop(ctx, controller.signal)
await ctx.pool.end()
