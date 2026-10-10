import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createPool } from './client.ts'

const pool = createPool()
await migrate(drizzle(pool), {
  migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
})
await pool.end()
console.log('migrations applied')
