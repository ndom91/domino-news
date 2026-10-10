import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.ts'

export type Db = NodePgDatabase<typeof schema>

export interface TxContext {
  db: Db
  // Raw client for the same transaction (used for transactional pg-boss sends).
  client: pg.PoolClient
}

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  return new pg.Pool({ connectionString, max: Number(process.env.DB_POOL_MAX ?? 10) })
}

export function createDb(pool: pg.Pool): Db {
  return drizzle(pool, { schema })
}

/** Runs `fn` in one transaction, exposing both Drizzle and the raw client. */
export async function withTransaction<T>(
  pool: pg.Pool,
  fn: (tx: TxContext) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn({ db: drizzle(client, { schema }), client })
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
