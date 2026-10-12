import { schema } from '@dn/db'
import type { FailedJob, FailedJobsResponse, OpsAction, OpsStatus } from '@dn/schemas'
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { ServerContext } from './context.ts'
import { PRIORITY, QUEUES } from './queues.ts'
import { DomainError } from './story-service.ts'

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
// Drizzle spreads an array into separate parameters, so `= any(${array})` doesn't work.
const inList = (values: string[]) =>
  sql`(${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )})`

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

  // Counted from the job table, not pg-boss's cached queue stats, which lag behind it and
  // would disagree with the failed-jobs list.
  const { rows: queueRows } = await db.execute<{
    name: string
    queued: number
    active: number
    failed: number
    oldest: number | null
  }>(sql`
    select name,
      count(*) filter (where state in ('created', 'retry'))::int as queued,
      count(*) filter (where state = 'active')::int as active,
      count(*) filter (where state = 'failed')::int as failed,
      extract(epoch from now() - min(created_on) filter (
        where state in ('created', 'retry') and start_after <= now()))::int as oldest
    from pgboss.job
    where name in ${inList(Object.values(QUEUES))}
    group by name`)
  const byQueue = new Map(queueRows.map((q) => [q.name, q]))

  const scalar = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0
  // Matches the outbox_pending_idx partial index (no full-table scan).
  const outboxPending = and(
    isNull(schema.outboxEvent.processedAt),
    isNull(schema.outboxEvent.deadAt),
  )
  const [oldestOutbox] = await db
    .select({
      s: sql<number | null>`extract(epoch from now() - min(${schema.outboxEvent.createdAt}))::int`,
    })
    .from(schema.outboxEvent)
    .where(outboxPending)
  const runs = await db
    .select()
    .from(schema.analysisRun)
    .orderBy(desc(schema.analysisRun.startedAt))
    .limit(12)

  const [
    articles,
    articlesEmbedded,
    articlesMatched,
    stories,
    storiesPublished,
    narratives,
    outboxPendingCount,
    outboxFailed,
  ] = await Promise.all([
    scalar(db.select({ n: count }).from(schema.article)),
    scalar(db.select({ n: count }).from(schema.articleEmbedding)),
    scalar(
      db
        .select({ n: count })
        .from(schema.storyArticle)
        .where(isNull(schema.storyArticle.removedAt)),
    ),
    scalar(db.select({ n: count }).from(schema.story)),
    scalar(db.select({ n: count }).from(schema.story).where(isNotNull(schema.story.publishedAt))),
    scalar(db.select({ n: count }).from(schema.narrative)),
    scalar(db.select({ n: count }).from(schema.outboxEvent).where(outboxPending)),
    scalar(
      db.select({ n: count }).from(schema.outboxEvent).where(isNotNull(schema.outboxEvent.deadAt)),
    ),
  ])

  return {
    inferenceMode: ctx.inference.mode,
    backfillPaused: await isBackfillPaused(ctx),
    feeds: feeds.map((f) => ({
      ...f,
      lastPolledAt: f.lastPolledAt?.toISOString() ?? null,
    })),
    queues: Object.values(QUEUES).map((name) => {
      const q = byQueue.get(name)
      return {
        name,
        queued: q?.queued ?? 0,
        active: q?.active ?? 0,
        failed: q?.failed ?? 0,
        oldestQueuedAgeSeconds: q?.oldest ?? null,
      }
    }),
    pipeline: {
      articles,
      articlesEmbedded,
      articlesMatched,
      stories,
      storiesPublished,
      narratives,
      outboxPending: outboxPendingCount,
      outboxFailed,
      oldestOutboxAgeSeconds: oldestOutbox?.s ?? null,
    },
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

export const FAILED_PAGE_SIZE = 25
const STACK_LINES = 12

// The analysis_run operation each queue records, so a failed job can show its attempts.
const QUEUE_OPERATION: Record<string, string> = {
  [QUEUES.matchArticle]: 'story_match',
  [QUEUES.summarizeStory]: 'story_summary',
  [QUEUES.relateStory]: 'story_relationship',
  [QUEUES.generateContext]: 'story_context',
  [QUEUES.extractClaims]: 'story_claims',
}

type FailedRow = {
  id: string
  name: string
  data: unknown
  output: unknown
  retry_count: number
  retry_limit: number
  created_on: Date
  completed_on: Date | null
}

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null)

/** Failed jobs, newest first. The cursor is "<failedAt ISO>|<id>". */
export async function listFailedJobs(
  ctx: ServerContext,
  opts: { queue?: string; cursor?: string },
): Promise<FailedJobsResponse> {
  const [at, id] = opts.cursor?.split('|') ?? []
  const { rows } = await ctx.db.execute<FailedRow>(sql`
    select id, name, data, output, retry_count, retry_limit, created_on, completed_on
    from pgboss.job
    where state = 'failed'
      ${opts.queue ? sql`and name = ${opts.queue}` : sql``}
      ${at && id ? sql`and (completed_on, id) < (${at}::timestamptz, ${id}::uuid)` : sql``}
    order by completed_on desc nulls last, id desc
    limit ${FAILED_PAGE_SIZE + 1}`)
  const page = rows.slice(0, FAILED_PAGE_SIZE)
  const items = await Promise.all(page.map((row) => describeFailedJob(ctx, row)))
  const last = page[page.length - 1]
  return {
    items,
    pageInfo: {
      nextCursor:
        rows.length > FAILED_PAGE_SIZE && last?.completed_on
          ? `${iso(last.completed_on)}|${last.id}`
          : null,
    },
  }
}

async function describeFailedJob(ctx: ServerContext, row: FailedRow): Promise<FailedJob> {
  const { db } = ctx
  // pg-boss stores a thrown error as { name, message, stack }.
  const output = (row.output ?? {}) as { message?: unknown; stack?: unknown }
  const message = typeof output.message === 'string' ? output.message : null
  const stack =
    typeof output.stack === 'string'
      ? output.stack.split('\n').slice(0, STACK_LINES).join('\n')
      : null
  const targetId = (row.data as { targetId?: unknown } | null)?.targetId
  let target: FailedJob['target'] = null
  if (typeof targetId === 'string' && targetId.startsWith('sty_')) {
    const [story] = await db
      .select({
        title: schema.story.title,
        slug: schema.story.slug,
        publishedAt: schema.story.publishedAt,
      })
      .from(schema.story)
      .where(eq(schema.story.id, targetId))
    if (story) {
      target = {
        type: 'story',
        id: targetId,
        title: story.title,
        href: story.publishedAt ? `/stories/${story.slug}` : null,
      }
    }
  } else if (typeof targetId === 'string' && targetId.startsWith('art_')) {
    const [article] = await db
      .select({ title: schema.articleRevision.title, url: schema.article.canonicalUrl })
      .from(schema.article)
      .innerJoin(
        schema.articleRevision,
        eq(schema.articleRevision.id, schema.article.latestRevisionId),
      )
      .where(eq(schema.article.id, targetId))
    if (article) target = { type: 'article', id: targetId, title: article.title, href: article.url }
  }
  const operation = QUEUE_OPERATION[row.name]
  const runs =
    operation && typeof targetId === 'string'
      ? await db
          .select()
          .from(schema.analysisRun)
          .where(
            and(
              eq(schema.analysisRun.operation, operation),
              eq(schema.analysisRun.targetId, targetId),
            ),
          )
          .orderBy(desc(schema.analysisRun.startedAt))
          .limit(5)
      : []
  return {
    id: row.id,
    queue: row.name,
    createdAt: new Date(row.created_on).toISOString(),
    failedAt: iso(row.completed_on),
    attempts: row.retry_count + 1,
    maxAttempts: row.retry_limit + 1,
    error: message ?? (row.output ? JSON.stringify(row.output).slice(0, 2000) : null),
    stack,
    payload: row.data,
    target,
    runs: runs.map((r) => ({
      id: r.id,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      modelId: r.modelId,
      promptVersion: r.promptVersion,
      error: r.error,
    })),
  }
}

/** Ids of the given failed jobs, or every failed job in the queue. */
async function failedIds(ctx: ServerContext, queue: string, ids?: string[]) {
  const { rows } = await ctx.db.execute<{ id: string }>(sql`
    select id from pgboss.job
    where name = ${queue} and state = 'failed'
      ${ids ? sql`and id::text in ${inList(ids)}` : sql``}`)
  return rows.map((r) => r.id)
}

export async function runOpsAction(ctx: ServerContext, input: OpsAction) {
  if (input.action === 'retry_jobs' || input.action === 'dismiss_jobs') {
    if (!(Object.values(QUEUES) as string[]).includes(input.queue)) {
      throw new DomainError('bad_request', `unknown queue ${input.queue}`)
    }
    const ids = await failedIds(ctx, input.queue, input.ids)
    if (ids.length === 0) return { count: 0 }
    const boss = await ctx.boss()
    if (input.action === 'retry_jobs') await boss.retry(input.queue, ids)
    else await boss.deleteJob(input.queue, ids)
    return { count: ids.length }
  }
  const { action } = input
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
