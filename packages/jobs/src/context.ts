import type { TxContext } from '@dn/db'
import type { ServerContext } from '@dn/server'
import type { PgBoss, SendOptions } from 'pg-boss'
import type { Gpu } from './dispatcher.ts'

export interface WorkerContext extends ServerContext {
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
