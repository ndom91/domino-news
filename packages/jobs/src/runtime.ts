import {
  type AnalysisJob,
  PRIORITY,
  processOutboxBatch,
  pruneDeliveredEvents,
  QUEUES,
  rebuildSearchIndex,
} from '@dn/server'
import type { Job, PgBoss, Queue } from 'pg-boss'
import { admitBackfill } from './backfill.ts'
import { extractStoryClaims } from './claims.ts'
import type { WorkerContext } from './context.ts'
import { embedArticles } from './embed.ts'
import { explainStoryContext } from './explain-context.ts'
import { pollFeed } from './ingest.ts'
import { matchArticle } from './match.ts'
import { relateStory } from './relate.ts'
import { feedIds } from './seed.ts'
import { summarizeStory } from './summarize.ts'

// `exclusive`: at most one created/retry/active job per singletonKey (task+target+fingerprint+version).
// Generous retries with capped backoff let work survive an inference outage of a few hours.
const QUEUE_OPTIONS: Omit<Queue, 'name'> = {
  policy: 'exclusive',
  retryLimit: 20,
  retryDelay: 10,
  retryBackoff: true,
  retryDelayMax: 600,
  expireInSeconds: 15 * 60,
  retentionSeconds: 7 * 86_400,
  deleteAfterSeconds: 3 * 86_400,
}

export async function createQueues(boss: PgBoss) {
  for (const name of Object.values(QUEUES)) {
    const existing = await boss.getQueue(name)
    if (existing) continue
    // A rebuild re-creates collections; retrying a still-running one would orphan them.
    const options =
      name === QUEUES.rebuildSearch
        ? { ...QUEUE_OPTIONS, retryLimit: 0, expireInSeconds: 6 * 3600 }
        : QUEUE_OPTIONS
    await boss.createQueue(name, options)
  }
}

type Handler = (jobs: Job<AnalysisJob>[]) => Promise<unknown>

/**
 * Two workers per analysis queue: `freshSlots` that only take fresh/interactive jobs, plus
 * one shared slot that takes anything by priority. Backfill can therefore never occupy
 * more than one slot, and fresh news always has capacity.
 */
async function workWithReservedSlots(
  boss: PgBoss,
  name: string,
  freshSlots: number,
  handler: Handler,
  batchSize = 1,
) {
  await boss.work<AnalysisJob>(
    name,
    {
      localConcurrency: freshSlots,
      minPriority: PRIORITY.fresh,
      batchSize,
      pollingIntervalSeconds: 1,
    },
    handler,
  )
  await boss.work<AnalysisJob>(
    name,
    { localConcurrency: 1, batchSize, pollingIntervalSeconds: 2 },
    handler,
  )
}

const each =
  (fn: (job: AnalysisJob) => Promise<unknown>): Handler =>
  async (jobs) => {
    for (const job of jobs) {
      try {
        const result = await fn(job.data)
        console.log(`[${job.name}] ${job.data.targetId} ${JSON.stringify(result)}`)
      } catch (error) {
        // Message only: errors never include transient article text.
        console.error(`[${job.name}] ${job.data.targetId} failed: ${(error as Error).message}`)
        throw error
      }
    }
  }

export async function startWorkers(ctx: WorkerContext) {
  const boss = ctx.workerBoss
  await createQueues(boss)

  await boss.work<{ feedId: string; variant?: 'rss' | 'rss-update' }>(
    QUEUES.pollFeed,
    { localConcurrency: 4 },
    async ([job]) => {
      if (!job) return
      const result = await pollFeed(ctx, job.data.feedId, job.data.variant)
      console.log(`[poll_feed] ${job.data.feedId} ${JSON.stringify(result)}`)
    },
  )
  await boss.work(QUEUES.pollAllFeeds, async () => {
    for (const feedId of await feedIds(ctx.db)) {
      await boss.send(
        QUEUES.pollFeed,
        { feedId },
        { singletonKey: feedId, priority: PRIORITY.fresh },
      )
    }
  })
  await boss.work(QUEUES.admitBackfill, async () => {
    const result = await admitBackfill(ctx)
    if (result.admitted > 0) console.log(`[admit_backfill] ${JSON.stringify(result)}`)
  })
  await boss.work(QUEUES.pruneEvents, async () => {
    const result = await pruneDeliveredEvents(ctx.db, ctx.config.eventRetentionDays)
    console.log(`[prune_delivered_events] ${JSON.stringify(result)}`)
  })
  await boss.work(QUEUES.rebuildSearch, async () => {
    await rebuildSearchIndex(ctx.db, ctx.ts)
  })

  const genSlots = Math.max(1, ctx.config.generationConcurrency)
  await workWithReservedSlots(
    boss,
    QUEUES.embedArticle,
    ctx.config.embeddingConcurrency,
    async (jobs) => {
      await embedArticles(ctx, jobs)
      console.log(`[embed_article] embedded batch of ${jobs.length}`)
    },
    16,
  )
  // Matching runs in parallel; matchArticle serialises only its final write (advisory lock).
  await workWithReservedSlots(
    boss,
    QUEUES.matchArticle,
    genSlots,
    each((job) => matchArticle(ctx, job)),
  )
  await workWithReservedSlots(
    boss,
    QUEUES.summarizeStory,
    genSlots,
    each((job) => summarizeStory(ctx, job)),
  )
  await workWithReservedSlots(
    boss,
    QUEUES.generateContext,
    genSlots,
    each((job) => explainStoryContext(ctx, job)),
  )
  await workWithReservedSlots(
    boss,
    QUEUES.extractClaims,
    genSlots,
    each((job) => extractStoryClaims(ctx, job)),
  )
  // Relating is serialised: it reads and extends the shared story graph.
  await boss.work<AnalysisJob>(
    QUEUES.relateStory,
    { localConcurrency: 1, pollingIntervalSeconds: 1 },
    each((job) => relateStory(ctx, job)),
  )

  await boss.schedule(QUEUES.pollAllFeeds, ctx.config.feedPollCron, null, { singletonKey: 'cron' })
  await boss.schedule(QUEUES.admitBackfill, '* * * * *', null, { singletonKey: 'cron' })
  await boss.schedule(QUEUES.pruneEvents, '17 3 * * *', null, { singletonKey: 'cron' })
}

/** Outbox -> Typesense loop for the separate indexer process. */
export async function runIndexerLoop(ctx: Pick<WorkerContext, 'db' | 'ts'>, signal: AbortSignal) {
  while (!signal.aborted) {
    try {
      const { fetched, processed, failed } = await processOutboxBatch(ctx.db, ctx.ts)
      if (fetched > 0) console.log(`[indexer] processed=${processed} failed=${failed}`)
      if (fetched === 0) await sleep(1000)
    } catch (error) {
      console.error('[indexer] batch failed', String(error))
      await sleep(5000)
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
