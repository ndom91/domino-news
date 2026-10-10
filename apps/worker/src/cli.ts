import { parseArgs } from 'node:util'
import { createQueues, type FixtureVariant, feedIds, pollFeed, seedPublishers } from '@dn/jobs'
import {
  createUserAccount,
  ensureCollections,
  getOpsStatus,
  PIPELINE_VERSION,
  PRIORITY,
  QUEUES,
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
    case 'dev:reset': {
      // TRUNCATE bypasses the append-only row triggers by design (dev-only reset).
      await ctx.pool.query(`begin;
        truncate story_summary_source, story_summary_version, story_source_reference, source_reference,
          narrative_story, narrative, story_relationship, story_lineage_event, story_alias, story_article,
          story, interpretation_evidence, interpretation, analysis_run, article_embedding, feed_entry,
          ingest_run, outbox_event, inbox_event, search_projection_state, observation, article_revision,
          article, pipeline_control;
        update feed set last_polled_at = null, last_status = null, last_error = null, etag = null, last_modified = null;
        delete from pgboss.job;
        commit;`)
      for (const alias of ['stories', 'narratives', 'articles']) {
        const collection = await ctx.ts
          .request<{ collection_name: string }>('GET', `/aliases/${alias}`)
          .catch(() => null)
        if (collection) await ctx.ts.request('DELETE', `/collections/${collection.collection_name}`)
        await ctx.ts.request('DELETE', `/aliases/${alias}`).catch(() => {})
      }
      await ensureCollections(ctx.ts)
      console.log('reset complete')
      break
    }
    case 'relate:all': {
      if (values.reset) {
        // Graph rows are derived interpretations; outbox events let the indexer drop stale narratives.
        await ctx.pool.query(`begin;
          insert into outbox_event (aggregate_type, aggregate_id, event_type, aggregate_version)
            select 'narrative', id, 'narrative.removed', version + 1 from narrative;
          insert into outbox_event (aggregate_type, aggregate_id, event_type, aggregate_version)
            select 'story', id, 'story.graph_reset', version + 1 from story;
          update story set version = version + 1;
          delete from narrative_story; delete from narrative; delete from story_relationship;
          commit;`)
      }
      const { rows } = await ctx.pool.query<{ id: string; current_summary_id: string }>(
        'select id, current_summary_id from story where published_at is not null order by first_observed_at',
      )
      for (const r of rows) {
        await ctx.workerBoss.send(
          QUEUES.relateStory,
          {
            targetId: r.id,
            inputFingerprint: r.current_summary_id,
            pipelineVersion: PIPELINE_VERSION,
            priorityClass: 'backfill',
          },
          {
            singletonKey: `${r.id}:${r.current_summary_id}:${PIPELINE_VERSION}`,
            priority: PRIORITY.backfill,
          },
        )
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
