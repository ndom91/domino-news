import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import {
  CANDIDATE_WINDOW_SECONDS,
  createQueues,
  type FixtureVariant,
  feedIds,
  importAssessmentEvidence,
  matchPolicy,
  NEIGHBOURS,
  pollFeed,
  publishAssessments,
  reviewHtml,
  runMatchEval,
  sampleMatchSet,
  seedPublishers,
  writeJson,
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
  assessments:import                Refresh publisher evidence from Wikidata, Wikipedia's perennial sources
                                    and fixtures/lean-evidence.json
  assessments:publish --username u [--dry-run]
                                    Publish fixtures/assessments.json as admin u (skips unchanged ones;
                                    run assessments:import first)
  match:sample --name n --seed <title regex> [--seed …] [--days 6] [--random 100] [--neighbour-min 0.8]
                                    Draw a match evaluation set into fixtures/match-eval/<name>.json
  match:review --name n             Write a review page for its labels (reviewed labels, else the draft)
  match:eval --name n [--label l] [--auto-same x] [--llm-min y] [--candidates k]
                                    Replay matching over a labelled set and score it (B-cubed)
  backfill:pause | backfill:resume
  enrich:all [--reset-graph]        Re-run relationships, narratives, context and claims for published stories
                                    (--reset-graph clears relationships/narratives first)
  summaries:refresh [--all]         Re-summarise published stories that have no desk yet, or every published
                                    story with --all (backfill priority; edited summaries are kept)
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
    'dry-run': { type: 'boolean', default: false },
    name: { type: 'string' },
    seed: { type: 'string', multiple: true },
    days: { type: 'string', default: '6' },
    random: { type: 'string', default: '100' },
    'neighbour-min': { type: 'string', default: '0.8' },
    label: { type: 'string', default: 'current' },
    'auto-same': { type: 'string' },
    'llm-min': { type: 'string' },
    candidates: { type: 'string' },
    all: { type: 'boolean', default: false },
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
    case 'assessments:publish':
      if (!values.username) throw new Error('--username required (an admin)')
      console.log(
        await publishAssessments(
          ctx,
          { username: values.username, dryRun: values['dry-run'] },
          (msg) => console.log(`[assessments] ${msg}`),
        ),
      )
      break
    case 'match:sample': {
      if (!values.name || !values.seed?.length)
        throw new Error('--name and at least one --seed required')
      const set = await sampleMatchSet(ctx.db, {
        name: values.name,
        days: Number(values.days),
        seeds: values.seed,
        neighbourMin: Number(values['neighbour-min']),
        randomCount: Number(values.random),
      })
      const file = `${ctx.config.fixtureDir}/match-eval/${values.name}.json`
      await writeJson(file, set)
      console.log(`${set.articles.length} articles → ${file}`)
      break
    }
    case 'match:review': {
      if (!values.name) throw new Error('--name required')
      const dir = `${ctx.config.fixtureDir}/match-eval`
      const read = async (file: string) => JSON.parse(await readFile(`${dir}/${file}`, 'utf8'))
      const set = await read(`${values.name}.json`)
      const labels = await read(`${values.name}.labels.json`).catch(() =>
        read(`${values.name}.labels-draft.json`),
      )
      const out = `${dir}/${values.name}.review.html`
      await writeFile(out, reviewHtml(set, labels))
      console.log(`open ${out}`)
      break
    }
    case 'match:eval': {
      if (!values.name) throw new Error('--name required')
      const base = matchPolicy(ctx.inference.mode)
      const policy = {
        autoSame: values['auto-same'] ? Number(values['auto-same']) : base.autoSame,
        llmMin: values['llm-min'] ? Number(values['llm-min']) : base.llmMin,
        maxCandidates: values.candidates ? Number(values.candidates) : base.maxCandidates,
      }
      const r = await runMatchEval(ctx, {
        name: values.name,
        label: values.label,
        policy,
        neighbours: NEIGHBOURS,
        windowSeconds: CANDIDATE_WINDOW_SECONDS,
        log: (msg) => console.log(`[eval] ${msg}`),
      })
      const pct = (n: number) => `${(n * 100).toFixed(1)}%`
      console.log(
        `${r.set} · ${r.label} · ${r.promptVersion} · ${JSON.stringify(r.policy)}\n` +
          `  F1 ${pct(r.score.f1)}  precision ${pct(r.score.precision)} (over-merging)  recall ${pct(r.score.recall)} (fragmentation)\n` +
          `  stories ${r.score.predictedStories} vs ${r.score.labelledStories} labelled · singletons ${r.score.predictedSingletons} vs ${r.score.labelledSingletons}\n` +
          `  model calls ${r.modelCalls} new, ${r.cachedCalls} cached, ${r.failedCalls} invalid\n` +
          `  most fragmented:\n${r.fragmented
            .slice(0, 8)
            .map((f) => `    ${f.pieces} pieces · ${f.size} articles · ${f.title}`)
            .join('\n')}\n` +
          `  most over-merged:\n${r.overMerged
            .slice(0, 5)
            .map((o) => `    ${o.size} articles mixing: ${o.labelled.join(' | ')}`)
            .join('\n')}`,
      )
      break
    }
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
      // the new version because the Story has no desk, or because the job is forced.
      const all = values.all
      const { rows } = await ctx.pool.query<{ id: string; input_fingerprint: string }>(
        `select id, input_fingerprint from story where published_at is not null ${all ? '' : 'and desk is null'} and input_fingerprint is not null order by last_updated_at desc`,
      )
      for (const r of rows) {
        const job = analysisJob(r.id, r.input_fingerprint, 'backfill')
        await ctx.workerBoss.send(QUEUES.summarizeStory, { ...job.data, force: all }, job.options)
      }
      console.log(`enqueued summaries for ${rows.length} stories${all ? '' : ' without a desk'}`)
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
