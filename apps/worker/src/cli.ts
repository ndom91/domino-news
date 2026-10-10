import { parseArgs } from 'node:util'
import { createQueues, type FixtureVariant, feedIds, pollFeed, seedPublishers } from '@dn/jobs'
import {
  createUserAccount,
  ensureCollections,
  getOpsStatus,
  rebuildSearchIndex,
  setBackfillPaused,
} from '@dn/server'
import { bootWorkerContext } from './boot.ts'

const USAGE = `Usage: pnpm cli <command> [options]

  seed                              Upsert curated publishers and feeds (fixtures/publishers.json)
  ingest [--variant rss|rss-update] Poll every feed once now (fixture or live, per INGEST_MODE)
  user:create --username u --password p
  search:rebuild                    Rebuild Typesense collections from Postgres and swap aliases
  backfill:pause | backfill:resume
  status                            Print pipeline/queue status as JSON`

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    username: { type: 'string' },
    password: { type: 'string' },
    variant: { type: 'string', default: 'rss' },
  },
})

const ctx = await bootWorkerContext()
try {
  switch (positionals[0]) {
    case 'seed':
      await createQueues(ctx.workerBoss)
      await ensureCollections(ctx.ts)
      console.log(await seedPublishers(ctx.db, ctx.config.fixtureDir))
      break
    case 'ingest':
      for (const id of await feedIds(ctx.db)) {
        console.log(id, await pollFeed(ctx, id, values.variant as FixtureVariant))
      }
      break
    case 'user:create': {
      if (!values.username || !values.password)
        throw new Error('--username and --password required')
      const user = await createUserAccount(ctx.auth, {
        username: values.username,
        password: values.password,
      })
      console.log(`created user ${user.id} (${values.username})`)
      break
    }
    case 'search:rebuild':
      await rebuildSearchIndex(ctx.db, ctx.ts)
      break
    case 'backfill:pause':
    case 'backfill:resume':
      await setBackfillPaused(ctx, positionals[0] === 'backfill:pause')
      console.log(positionals[0])
      break
    case 'status':
      console.log(JSON.stringify(await getOpsStatus(ctx), null, 2))
      break
    default:
      console.log(USAGE)
  }
} finally {
  await ctx.workerBoss.stop({ graceful: false })
  await ctx.pool.end()
}
