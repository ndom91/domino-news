import { createDb, createPool, type Db } from '@dn/db'
import { createInferenceFromEnv, type InferenceProviders } from '@dn/inference'
import type pg from 'pg'
import { PgBoss } from 'pg-boss'
import { type Auth, createAuth } from './auth.ts'
import { type Config, readConfig } from './config.ts'
import { createTypesense, type Typesense } from './search/typesense.ts'

export interface ServerContext {
  config: Config
  pool: pg.Pool
  db: Db
  ts: Typesense
  inference: InferenceProviders
  auth: Auth
  /** Producer-only pg-boss handle (no workers, no maintenance). */
  boss: () => Promise<PgBoss>
}

export function createServerContext(env = process.env): ServerContext {
  const config = readConfig(env)
  const pool = createPool(config.databaseUrl)
  const db = createDb(pool)
  let bossPromise: Promise<PgBoss> | null = null
  return {
    config,
    pool,
    db,
    ts: createTypesense(config.typesenseUrl, config.typesenseApiKey),
    inference: createInferenceFromEnv(env),
    auth: createAuth(db, env),
    boss: () => {
      bossPromise ??= (async () => {
        const boss = new PgBoss({
          connectionString: config.databaseUrl,
          supervise: false,
          schedule: false,
          migrate: false,
          max: 2,
        })
        boss.on('error', (error) => console.error('[pg-boss]', error))
        await boss.start()
        return boss
      })()
      return bossPromise
    },
  }
}

let shared: ServerContext | undefined
/** Process-wide context for the web server. */
export function getServerContext() {
  shared ??= createServerContext()
  return shared
}
