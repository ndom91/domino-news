import { parseArgs } from 'node:util'
import {
  createQueues,
  type FixtureVariant,
  feedIds,
  importAssessmentEvidence,
  pollFeed,
  seedPublishers,
} from '@dn/jobs'
import {
  analysisJob,
  createUserAccount,
  ENRICHMENT_QUEUES,
  getOpsStatus,
  QUEUES,
  rebuildSearchIndex,
  resetIngestedData,
  resetStoryGraph,
  setBackfillPaused,
  setUserRole,
  type UserRole,
} from '@dn/server'
import { bootWorkerContext } from './boot.ts'

const USAGE = `Usage: pnpm cli <command> [options]

  seed                              Upsert curated publishers and feeds (fixtures/publishers.json)
  ingest [--variant rss|rss-update] Poll every feed once now (fixture or live, per INGEST_MODE)
  user:create --username u --password p [--role admin|user]   (default admin)
  user:role --username u --role admin|user
  search:rebuild                    Rebuild Typesense collections from Postgres and swap aliases
  assessments:import                Refresh publisher evidence from Wikidata and Wikipedia's perennial sources
  backfill:pause | backfill:resume
  enrich:all [--reset-graph]        Re-run relationships, narratives, context and claims for published stories
                                    (--reset-graph clears relationships/narratives first)
  summaries:refresh                 Re-summarise published stories that have no desk yet (backfill priority)
  status                            Print pipeline/queue status as JSON
  dev:reset                         Delete all ingested/derived data and search collections (keeps users, publishers)`

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    username: { type: 'string' },
    password: { type: 'string' },
    role: { type: 'string' },
    variant: { type: 'string', default: 'rss' },
    'reset-graph': { type: 'boolean', default: false },
  },
})

function parseRole(role: string): UserRole {
  if (role !== 'admin' && role !== 'user') throw new Error('--role must be admin or user')
  return role
}

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
        role: parseRole(values.role ?? 'admin'),
      })
      console.log(`created user ${user.id} (${values.username})`)
      break
    }
    case 'user:role': {
      if (!values.username || !values.role) throw new Error('--username and --role required')
      await setUserRole(ctx.db, values.username, parseRole(values.role))
      console.log(`${values.username} is now ${values.role}`)
      break
    }
    case 'search:rebuild':
      await rebuildSearchIndex(ctx.db, ctx.ts)
      break
    case 'assessments:import':
      console.log(await importAssessmentEvidence(ctx, (msg) => console.log(`[assessments] ${msg}`)))
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
    case 'enrich:all': {
      if (values['reset-graph']) await resetStoryGraph(ctx.db)
      const { rows } = await ctx.pool.query<{ id: string; current_summary_id: string }>(
        'select id, current_summary_id from story where published_at is not null order by first_observed_at',
      )
      for (const r of rows) {
        const job = analysisJob(r.id, r.current_summary_id, 'backfill')
        for (const queue of ENRICHMENT_QUEUES)
          await ctx.workerBoss.send(queue, job.data, job.options)
      }
      console.log(`enqueued enrichment for ${rows.length} stories`)
      break
    }
    case 'summaries:refresh': {
      // Same inputs, so the job's fingerprint is unchanged; recordGeneratedSummary allows
      // the new version because the Story has no desk.
      const { rows } = await ctx.pool.query<{ id: string; input_fingerprint: string }>(
        'select id, input_fingerprint from story where published_at is not null and desk is null and input_fingerprint is not null order by last_updated_at desc',
      )
      for (const r of rows) {
        const job = analysisJob(r.id, r.input_fingerprint, 'backfill')
        await ctx.workerBoss.send(QUEUES.summarizeStory, job.data, job.options)
      }
      console.log(`enqueued summaries for ${rows.length} stories without a desk`)
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
