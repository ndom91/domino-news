import {
  createQueues,
  embedArticles,
  explainStoryContext,
  matchArticle,
  relateStory,
  summarizeStory,
  type WorkerContext,
} from '@dn/jobs'
import { type AnalysisJob, processOutboxBatch, QUEUES } from '@dn/server'
import type { Job } from 'pg-boss'

/** Runs queued pipeline jobs inline (ignoring start delays) until everything settles. */
export async function drainPipeline(ctx: WorkerContext, maxRounds = 50) {
  await createQueues(ctx.workerBoss)
  for (let round = 0; round < maxRounds; round++) {
    let worked = false
    await processOutboxBatch(ctx.db, ctx.ts, 500)
    const perJob: Record<string, (job: AnalysisJob) => Promise<unknown>> = {
      [QUEUES.matchArticle]: (job) => matchArticle(ctx, job),
      [QUEUES.summarizeStory]: (job) => summarizeStory(ctx, job),
      [QUEUES.relateStory]: (job) => relateStory(ctx, job),
      [QUEUES.generateContext]: (job) => explainStoryContext(ctx, job),
    }
    for (const name of [QUEUES.embedArticle, ...Object.keys(perJob)]) {
      const jobs = (await ctx.workerBoss.fetch<AnalysisJob>(name, {
        batchSize: 50,
        ignoreStartAfter: true,
      })) as Job<AnalysisJob>[]
      if (jobs.length === 0) continue
      worked = true
      if (name === QUEUES.embedArticle) {
        await embedArticles(ctx, jobs)
        await processOutboxBatch(ctx.db, ctx.ts, 500)
      }
      for (const job of name === QUEUES.embedArticle ? [] : jobs) {
        await perJob[name]?.(job.data)
        await processOutboxBatch(ctx.db, ctx.ts, 500)
      }
      await ctx.workerBoss.complete(
        name,
        jobs.map((j) => j.id),
      )
    }
    await processOutboxBatch(ctx.db, ctx.ts, 500)
    if (!worked) return round
  }
  throw new Error('pipeline did not settle')
}

export async function seedAndRunFixtures(ctx: WorkerContext) {
  const { feedIds, pollFeed, seedPublishers } = await import('@dn/jobs')
  await seedPublishers(ctx.db, ctx.config.fixtureDir)
  for (const id of await feedIds(ctx.db)) await pollFeed(ctx, id, 'rss')
  await drainPipeline(ctx)
}
