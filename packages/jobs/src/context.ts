import type { TxContext } from '@dn/db'
import type { ServerContext } from '@dn/server'
import type { PgBoss, SendOptions } from 'pg-boss'
import type { Gpu } from './dispatcher.ts'

export interface WorkerContext extends ServerContext {
  // Same instance `boss()` resolves to. Ops code shared with the web app uses the lazy
  // `boss()`; pipeline code needs this already-started handle synchronously.
  workerBoss: PgBoss
  gpu: Gpu
}

/** pg-boss send inside an existing Postgres transaction (job commits with the domain write). */
export function sendInTx(
  ctx: WorkerContext,
  tx: TxContext,
  name: string,
  data: object,
  options: SendOptions,
) {
  return ctx.workerBoss.send(name, data, {
    ...options,
    db: { executeSql: (text, values) => tx.client.query(text, values as unknown[]) },
  })
}
