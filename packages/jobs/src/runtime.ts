import {
  type AnalysisJob,
  PRIORITY,
  processOutboxBatch,
  pruneDeliveredEvents,
  prunePushDeliveries,
  pruneReaderHistory,
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
import {
  MatchLeaderPendingError,
  reconcileMatchAdmissions,
  resumeMatchFollower,
} from './match-admission.ts'
import { deliverForYouPushes } from './push-delivery.ts'
import { relateStory } from './relate.ts'
import { feedIds } from './seed.ts'
import { summarizeStory } from './summarize.ts'
import { reconcileSummaryDebounces, releaseSummaryDebounce } from './summary-debounce.ts'

// `exclusive`: at most one created/retry/active job per singletonKey (task+target+fingerprint+version).
// 5 retries with exponential backoff (about 1, 2, 4, 8, 16 minutes) cover a short inference
// outage without spending many GPU calls on output the model keeps getting wrong. Anything
// that still fails waits on the Pipeline page to be retried by hand.
const QUEUE_OPTIONS: Omit<Queue, 'name'> = {
  policy: 'exclusive',
  retryLimit: 5,
  retryDelay: 60,
  retryBackoff: true,
  retryDelayMax: 3600,
  expireInSeconds: 15 * 60,
  retentionSeconds: 7 * 86_400,
  deleteAfterSeconds: 3 * 86_400,
}

function queueOptions(name: string): Omit<Queue, 'name'> {
  // A rebuild re-creates collections; retrying a still-running one would orphan them.
  if (name === QUEUES.rebuildSearch)
    return { ...QUEUE_OPTIONS, retryLimit: 0, expireInSeconds: 6 * 3600 }
  if (name === QUEUES.resumeMatchArticle || name === QUEUES.releaseSummaryDebounce)
    return { ...QUEUE_OPTIONS, retryLimit: 5, retryDelay: 3, retryBackoff: true, retryDelayMax: 24 }
  return QUEUE_OPTIONS
}

/** Create missing queues, and bring existing ones up to the current options. */
export async function createQueues(boss: PgBoss) {
  for (const name of Object.values(QUEUES)) {
    const { policy, ...options } = queueOptions(name)
    if (await boss.getQueue(name)) {
      // The policy can't change after creation; jobs already queued keep their own retry settings.
      await boss.updateQueue(name, options)
    } else {
      await boss.createQueue(name, { policy, ...options })
    }
  }
}

type Handler = (jobs: Job<AnalysisJob>[]) => Promise<unknown>
const WORKER_POLL_SECONDS = 5

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
      pollingIntervalSeconds: WORKER_POLL_SECONDS,
    },
    handler,
  )
  await boss.work<AnalysisJob>(
    name,
    { localConcurrency: 1, batchSize, pollingIntervalSeconds: WORKER_POLL_SECONDS },
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

  await boss.work<{ feedId: string }>(
    QUEUES.pollFeed,
    { localConcurrency: 4, pollingIntervalSeconds: WORKER_POLL_SECONDS },
    async ([job]) => {
      if (!job) return
      const result = await pollFeed(ctx, job.data.feedId)
      console.log(`[poll_feed] ${job.data.feedId} ${JSON.stringify(result)}`)
    },
  )
  await boss.work(
    QUEUES.pollAllFeeds,
    { pollingIntervalSeconds: WORKER_POLL_SECONDS },
    async () => {
      for (const feedId of await feedIds(ctx.db)) {
        await boss.send(
          QUEUES.pollFeed,
          { feedId },
          { singletonKey: feedId, priority: PRIORITY.fresh },
        )
      }
    },
  )
  await boss.work(
    QUEUES.admitBackfill,
    { pollingIntervalSeconds: WORKER_POLL_SECONDS },
    async () => {
      const result = await admitBackfill(ctx)
      if (result.admitted > 0) console.log(`[admit_backfill] ${JSON.stringify(result)}`)
    },
  )
  await boss.work(QUEUES.pruneEvents, { pollingIntervalSeconds: WORKER_POLL_SECONDS }, async () => {
    const result = await pruneDeliveredEvents(ctx.db, ctx.config.eventRetentionDays)
    const reads = await pruneReaderHistory(ctx.db)
    await prunePushDeliveries(ctx.db)
    console.log(`[prune_delivered_events] ${JSON.stringify({ ...result, ...reads })}`)
  })
  await boss.work(
    QUEUES.rebuildSearch,
    { pollingIntervalSeconds: WORKER_POLL_SECONDS },
    async () => {
      await rebuildSearchIndex(ctx.db, ctx.ts)
    },
  )
  await boss.work(QUEUES.deliverPush, { pollingIntervalSeconds: WORKER_POLL_SECONDS }, async () => {
    const result = await deliverForYouPushes(ctx)
    if (result.alerted || result.invalidTokens || result.receiptsChecked || result.failed) {
      console.log(`[deliver_expo_push] ${JSON.stringify(result)}`)
    }
  })
  await boss.work(
    QUEUES.reconcileDeferredWork,
    { pollingIntervalSeconds: WORKER_POLL_SECONDS },
    async () => {
      const [matches, summaries] = await Promise.all([
        reconcileMatchAdmissions(ctx),
        reconcileSummaryDebounces(ctx),
      ])
      if (matches || summaries) {
        console.log(`[reconcile_deferred_work] ${JSON.stringify({ matches, summaries })}`)
      }
    },
  )

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
  await boss.work<AnalysisJob>(
    QUEUES.resumeMatchArticle,
    { localConcurrency: Math.max(1, genSlots), pollingIntervalSeconds: WORKER_POLL_SECONDS },
    async (jobs) => {
      for (const job of jobs) {
        try {
          const result = await resumeMatchFollower(ctx, job.data)
          console.log(`[${job.name}] ${job.data.targetId} ${JSON.stringify(result)}`)
        } catch (error) {
          // Waiting is the expected retry path, not an operational failure worth logging.
          if (!(error instanceof MatchLeaderPendingError)) {
            console.error(`[${job.name}] ${job.data.targetId} failed: ${(error as Error).message}`)
          }
          throw error
        }
      }
    },
  )
  await workWithReservedSlots(
    boss,
    QUEUES.summarizeStory,
    genSlots,
    each((job) => summarizeStory(ctx, job)),
  )
  await boss.work<AnalysisJob>(
    QUEUES.releaseSummaryDebounce,
    { localConcurrency: Math.max(1, genSlots), pollingIntervalSeconds: WORKER_POLL_SECONDS },
    each((job) => releaseSummaryDebounce(ctx, job)),
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
    { localConcurrency: 1, pollingIntervalSeconds: WORKER_POLL_SECONDS },
    each((job) => relateStory(ctx, job)),
  )

  await boss.schedule(QUEUES.pollAllFeeds, ctx.config.feedPollCron, null, { singletonKey: 'cron' })
  await boss.schedule(QUEUES.admitBackfill, '* * * * *', null, { singletonKey: 'cron' })
  await boss.schedule(QUEUES.reconcileDeferredWork, '* * * * *', null, { singletonKey: 'cron' })
  await boss.schedule(QUEUES.pruneEvents, '17 3 * * *', null, { singletonKey: 'cron' })
  await boss.schedule(QUEUES.deliverPush, ctx.config.expoPushDeliveryCron, null, {
    singletonKey: 'cron',
  })
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
