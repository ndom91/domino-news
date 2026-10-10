import { execFileSync } from 'node:child_process'
import pg from 'pg'

// Recreates the test database schema once per run. Requires the Compose Postgres.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://dn:dn@localhost:5442/dn_test'
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  await client.query(
    'drop schema if exists public cascade; drop schema if exists pgboss cascade; drop schema if exists drizzle cascade; create schema public;',
  )
  await client.end()
  execFileSync('pnpm', ['--filter', '@dn/db', 'exec', 'tsx', 'src/migrate.ts'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  })
}
