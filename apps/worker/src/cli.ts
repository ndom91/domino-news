import { parseArgs } from 'node:util'
import { createQueues, type FixtureVariant, feedIds, pollFeed, seedPublishers } from '@dn/jobs'
import {
  analysisJob,
  createUserAccount,
  getOpsStatus,
  QUEUES,
  rebuildSearchIndex,
  resetIngestedData,
  resetStoryGraph,
  setBackfillPaused,
} from '@dn/server'
import { bootWorkerContext } from './boot.ts'

const USAGE = `Usage: pnpm cli <command> [options]

  seed                              Upsert curated publishers and feeds (fixtures/publishers.json)
  ingest [--variant rss|rss-update] Poll every feed once now (fixture or live, per INGEST_MODE)
  user:create --username u --password p
  search:rebuild                    Rebuild Typesense collections from Postgres and swap aliases
  backfill:pause | backfill:resume
  relate:all [--reset]              Re-run story relationship + narrative detection (--reset clears edges/narratives first)
  status                            Print pipeline/queue status as JSON
  dev:reset                         Delete all ingested/derived data and search collections (keeps users, publishers)`

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    username: { type: 'string' },
    password: { type: 'string' },
    variant: { type: 'string', default: 'rss' },
    reset: { type: 'boolean', default: false },
  },
})

const ctx = await bootWorkerContext()
try {
  switch (positionals[0]) {
    case 'seed':
      await createQueues(ctx.workerBoss)
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
    case 'dev:reset':
      await resetIngestedData(ctx.pool)
      // Fresh, empty collections behind the aliases; the old ones are dropped.
      await rebuildSearchIndex(ctx.db, ctx.ts, () => {})
      console.log('reset complete')
      break
    case 'relate:all': {
      if (values.reset) await resetStoryGraph(ctx.db)
      const { rows } = await ctx.pool.query<{ id: string; current_summary_id: string }>(
        'select id, current_summary_id from story where published_at is not null order by first_observed_at',
      )
      for (const r of rows) {
        const job = analysisJob(r.id, r.current_summary_id, 'backfill')
        await ctx.workerBoss.send(QUEUES.relateStory, job.data, job.options)
      }
      console.log(`enqueued ${rows.length} relate jobs`)
      break
    }
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
