import { schema } from '@dn/db'
import type { OpsAction, OpsStatus } from '@dn/schemas'
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { ServerContext } from './context.ts'
import { PRIORITY, QUEUES } from './queues.ts'

const BACKFILL_PAUSED = 'backfill_paused'

export async function isBackfillPaused(ctx: Pick<ServerContext, 'db'>) {
  const [row] = await ctx.db
    .select()
    .from(schema.pipelineControl)
    .where(eq(schema.pipelineControl.key, BACKFILL_PAUSED))
  return row?.value === true
}

export async function setBackfillPaused(ctx: Pick<ServerContext, 'db'>, paused: boolean) {
  await ctx.db
    .insert(schema.pipelineControl)
    .values({ key: BACKFILL_PAUSED, value: paused })
    .onConflictDoUpdate({
      target: schema.pipelineControl.key,
      set: { value: paused, updatedAt: new Date() },
    })
}

const count = sql<number>`count(*)::int`

export async function getOpsStatus(ctx: ServerContext): Promise<OpsStatus> {
  const { db } = ctx
  const feeds = await db
    .select({
      id: schema.feed.id,
      publisherName: schema.publisher.name,
      url: schema.feed.url,
      enabled: schema.feed.enabled,
      lastPolledAt: schema.feed.lastPolledAt,
      lastStatus: schema.feed.lastStatus,
      lastError: schema.feed.lastError,
      articleCount: sql<number>`(select count(*)::int from feed_entry where feed_entry.feed_id = feed.id)`,
    })
    .from(schema.feed)
    .innerJoin(schema.publisher, eq(schema.publisher.id, schema.feed.publisherId))
    .orderBy(schema.publisher.name)

  const boss = await ctx.boss()
  const queues = await boss.getQueues(Object.values(QUEUES))
  const failures = await db.execute<{
    id: string
    name: string
    completed_on: Date | null
    output: unknown
  }>(
    sql`select id, name, completed_on, output from pgboss.job where state = 'failed' order by completed_on desc nulls last limit 10`,
  )

  const scalar = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0
  const [oldestOutbox] = await db
    .select({
      s: sql<number | null>`extract(epoch from now() - min(${schema.outboxEvent.createdAt}))::int`,
    })
    .from(schema.outboxEvent)
    // Matches the outbox_pending_idx partial index (no full-table scan).
    .where(and(isNull(schema.outboxEvent.processedAt), isNull(schema.outboxEvent.deadAt)))
  const runs = await db
    .select()
    .from(schema.analysisRun)
    .orderBy(desc(schema.analysisRun.startedAt))
    .limit(12)

  return {
    inferenceMode: ctx.inference.mode,
    backfillPaused: await isBackfillPaused(ctx),
    feeds: feeds.map((f) => ({
      ...f,
      lastPolledAt: f.lastPolledAt?.toISOString() ?? null,
    })),
    queues: queues.map((q) => ({
      name: q.name,
      queued: q.queuedCount,
      active: q.activeCount,
      failed: q.failedCount,
      oldestQueuedAgeSeconds: q.readyOldestSeconds,
    })),
    pipeline: {
      articles: await scalar(db.select({ n: count }).from(schema.article)),
      articlesEmbedded: await scalar(db.select({ n: count }).from(schema.articleEmbedding)),
      articlesMatched: await scalar(
        db
          .select({ n: count })
          .from(schema.storyArticle)
          .where(isNull(schema.storyArticle.removedAt)),
      ),
      stories: await scalar(db.select({ n: count }).from(schema.story)),
      storiesPublished: await scalar(
        db.select({ n: count }).from(schema.story).where(isNotNull(schema.story.publishedAt)),
      ),
      narratives: await scalar(db.select({ n: count }).from(schema.narrative)),
      outboxPending: await scalar(
        db
          .select({ n: count })
          .from(schema.outboxEvent)
          .where(
            sql`${schema.outboxEvent.processedAt} is null and ${schema.outboxEvent.deadAt} is null`,
          ),
      ),
      outboxFailed: await scalar(
        db
          .select({ n: count })
          .from(schema.outboxEvent)
          .where(isNotNull(schema.outboxEvent.deadAt)),
      ),
      oldestOutboxAgeSeconds: oldestOutbox?.s ?? null,
    },
    recentFailures: failures.rows.map((f) => ({
      id: f.id,
      queue: f.name,
      failedAt: f.completed_on ? new Date(f.completed_on).toISOString() : null,
      error: f.output ? JSON.stringify(f.output).slice(0, 400) : null,
    })),
    recentRuns: runs.map((r) => ({
      id: r.id,
      operation: r.operation,
      status: r.status,
      modelId: r.modelId,
      startedAt: r.startedAt.toISOString(),
      error: r.error,
    })),
  }
}

export async function runOpsAction(ctx: ServerContext, { action }: OpsAction) {
  switch (action) {
    case 'pause_backfill':
      return setBackfillPaused(ctx, true)
    case 'resume_backfill':
      return setBackfillPaused(ctx, false)
    case 'poll_all_feeds': {
      // Same job the cron runs; the worker fans out one poll per enabled feed.
      const boss = await ctx.boss()
      await boss.send(
        QUEUES.pollAllFeeds,
        {},
        { singletonKey: 'manual', priority: PRIORITY.interactive },
      )
      return
    }
    case 'rebuild_search': {
      const boss = await ctx.boss()
      await boss.send(
        QUEUES.rebuildSearch,
        {},
        { singletonKey: 'rebuild', priority: PRIORITY.interactive },
      )
      return
    }
  }
}
