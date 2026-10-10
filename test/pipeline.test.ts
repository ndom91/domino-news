import { schema } from '@dn/db'
import { feedIds, pollFeed, seedPublishers } from '@dn/jobs'
import {
  editSummary,
  processOutboxBatch,
  projectAggregate,
  recordGeneratedSummary,
  storyInputFingerprint,
  touchStory,
} from '@dn/server'
import { and, count, eq, isNotNull, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { drainPipeline } from './drain.ts'
import { createTestContext, truncateAll } from './harness.ts'

let h: Awaited<ReturnType<typeof createTestContext>>
const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0

async function pollAll(variant: 'rss' | 'rss-update' = 'rss') {
  for (const id of await feedIds(h.ctx.db)) await pollFeed(h.ctx, id, variant)
}

beforeAll(async () => {
  h = await createTestContext()
  await truncateAll(h.ctx)
  await seedPublishers(h.ctx.db, h.ctx.config.fixtureDir)
  await pollAll()
  await drainPipeline(h.ctx)
})

afterAll(async () => {
  await h?.close()
})

describe('fixture pipeline end to end', () => {
  it('publishes stories that each have at least one active source article', async () => {
    const { db } = h.ctx
    const published = await db
      .select()
      .from(schema.story)
      .where(isNotNull(schema.story.publishedAt))
    expect(published.length).toBeGreaterThan(5)
    for (const story of published) {
      const links = await n(
        db
          .select({ n: count() })
          .from(schema.storyArticle)
          .where(
            and(eq(schema.storyArticle.storyId, story.id), isNull(schema.storyArticle.removedAt)),
          ),
      )
      expect(links).toBeGreaterThan(0)
      expect(story.currentSummaryId).toBeTruthy()
    }
  })

  it('grounds every summary in articles linked to its story', async () => {
    const rows = await h.ctx.db
      .select({
        storyId: schema.storySummaryVersion.storyId,
        articleId: schema.storySummarySource.articleId,
      })
      .from(schema.storySummarySource)
      .innerJoin(
        schema.storySummaryVersion,
        eq(schema.storySummaryVersion.id, schema.storySummarySource.summaryVersionId),
      )
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      const [link] = await h.ctx.db
        .select()
        .from(schema.storyArticle)
        .where(
          and(
            eq(schema.storyArticle.storyId, r.storyId),
            eq(schema.storyArticle.articleId, r.articleId),
          ),
        )
      expect(link).toBeDefined()
    }
  })

  it('projects published stories into the search index', async () => {
    const published = await n(
      h.ctx.db.select({ n: count() }).from(schema.story).where(isNotNull(schema.story.publishedAt)),
    )
    expect(h.ctx.ts.collections.get('stories')?.size).toBe(published)
  })
})

describe('ingestion dedupe and revisions', () => {
  it('re-polling identical feeds creates no articles, revisions, observations or jobs', async () => {
    const { db } = h.ctx
    const before = {
      articles: await n(db.select({ n: count() }).from(schema.article)),
      revisions: await n(db.select({ n: count() }).from(schema.articleRevision)),
      observations: await n(db.select({ n: count() }).from(schema.observation)),
    }
    await pollAll()
    expect(await n(db.select({ n: count() }).from(schema.article))).toBe(before.articles)
    expect(await n(db.select({ n: count() }).from(schema.articleRevision))).toBe(before.revisions)
    expect(await n(db.select({ n: count() }).from(schema.observation))).toBe(before.observations)
    const queued = await h.ctx.workerBoss.getQueues()
    expect(queued.reduce((sum, q) => sum + q.queuedCount, 0)).toBe(0)
  })

  it('records headline changes as new revisions and dedupes tracking-param URLs', async () => {
    const { db } = h.ctx
    const articlesBefore = await n(db.select({ n: count() }).from(schema.article))
    const revisionsBefore = await n(db.select({ n: count() }).from(schema.articleRevision))
    await pollAll('rss-update')
    const articlesAfter = await n(db.select({ n: count() }).from(schema.article))
    const revisionsAfter = await n(db.select({ n: count() }).from(schema.articleRevision))
    // 3 update files each add one genuinely new item; the utm duplicates must not add articles.
    expect(articlesAfter - articlesBefore).toBe(3)
    // New items (3) + one edited headline per file (3).
    expect(revisionsAfter - revisionsBefore).toBe(6)
    const revisionObservations = await n(
      db
        .select({ n: count() })
        .from(schema.observation)
        .where(eq(schema.observation.type, 'article_revision_detected')),
    )
    expect(revisionObservations).toBe(3)
    await drainPipeline(h.ctx)
  })
})

describe('append-only invariants', () => {
  it('rejects updates and deletes of observations', async () => {
    const [obs] = await h.ctx.db.select().from(schema.observation).limit(1)
    await expect(
      h.ctx.pool.query('update observation set source_url = $1 where id = $2', ['x', obs?.id]),
    ).rejects.toThrow(/append-only/)
    await expect(
      h.ctx.pool.query('delete from observation where id = $1', [obs?.id]),
    ).rejects.toThrow(/append-only/)
  })

  it('rejects updates of article revisions and summary versions', async () => {
    await expect(h.ctx.pool.query(`update article_revision set title = 'x'`)).rejects.toThrow(
      /append-only/,
    )
    await expect(h.ctx.pool.query(`update story_summary_version set body = 'x'`)).rejects.toThrow(
      /append-only/,
    )
  })

  it('refuses to publish a story without an active source article', async () => {
    await expect(
      h.ctx.pool.query(
        `insert into story (id, slug, title, first_observed_at, last_updated_at, published_at)
         values ('sty_empty', 'empty', 'Empty', now(), now(), now())`,
      ),
    ).rejects.toThrow(/without an active source article/)
  })
})

describe('summary versioning', () => {
  it('edits create a new version, keep history and reject stale bases', async () => {
    const { db } = h.ctx
    const [story] = await db
      .select()
      .from(schema.story)
      .where(isNotNull(schema.story.publishedAt))
      .limit(1)
    if (!story?.currentSummaryId) throw new Error('no published story')
    const previous = story.currentSummaryId
    const versionId = await db.transaction((tx) =>
      editSummary(tx, {
        storyId: story.id,
        basedOnVersionId: previous,
        headline: 'Edited headline',
        body: 'Edited body.',
        userId: 'user_test',
      }),
    )
    const [after] = await db.select().from(schema.story).where(eq(schema.story.id, story.id))
    expect(after?.currentSummaryId).toBe(versionId)
    const [old] = await db
      .select()
      .from(schema.storySummaryVersion)
      .where(eq(schema.storySummaryVersion.id, previous))
    expect(old).toBeDefined()
    await expect(
      db.transaction((tx) =>
        editSummary(tx, {
          storyId: story.id,
          basedOnVersionId: previous,
          headline: 'x',
          body: 'y',
          userId: 'u',
        }),
      ),
    ).rejects.toThrow(/changed since/)
  })

  it('ignores generated summaries computed from outdated inputs', async () => {
    const { db } = h.ctx
    const [story] = await db
      .select()
      .from(schema.story)
      .where(isNotNull(schema.story.publishedAt))
      .limit(1)
    if (!story) throw new Error('no story')
    const [link] = await db
      .select()
      .from(schema.storyArticle)
      .where(eq(schema.storyArticle.storyId, story.id))
    const result = await db.transaction((tx) =>
      recordGeneratedSummary(tx, {
        storyId: story.id,
        output: {
          headline: 'Stale',
          summary: 'Stale',
          sourceArticleIds: [link?.articleId ?? ''],
          observationIds: ['obs_x'],
        },
        analysisRunId: 'run_none',
        inputFingerprint: 'outdated-fingerprint',
      }),
    )
    expect(result).toEqual({ status: 'stale' })
    expect(await storyInputFingerprint(db, story.id)).toBe(story.inputFingerprint)
  })

  it('rejects summaries citing articles not linked to the story', async () => {
    const { db } = h.ctx
    const [story] = await db
      .select()
      .from(schema.story)
      .where(isNotNull(schema.story.publishedAt))
      .limit(1)
    if (!story) throw new Error('no story')
    // Pretend the inputs changed so the result is not discarded as stale; the transaction rolls back.
    await expect(
      db.transaction(async (tx) => {
        await tx
          .update(schema.story)
          .set({ inputFingerprint: 'fp_new' })
          .where(eq(schema.story.id, story.id))
        return recordGeneratedSummary(tx, {
          storyId: story.id,
          output: {
            headline: 'x',
            summary: 'y',
            sourceArticleIds: ['art_elsewhere'],
            observationIds: ['obs_x'],
          },
          analysisRunId: 'run_none',
          inputFingerprint: 'fp_new',
        })
      }),
    ).rejects.toThrow(/unlinked articles/)
  })
})

describe('search outbox replay', () => {
  it('converges on current state under duplicate, out-of-order and replayed events', async () => {
    const { db, ts } = h.ctx
    const [story] = await db
      .select()
      .from(schema.story)
      .where(isNotNull(schema.story.publishedAt))
      .limit(1)
    if (!story) throw new Error('no story')
    const stories = ts.collections.get('stories')
    stories?.delete(story.id)
    // Replay an old event (lower version) followed by a duplicate: the indexer re-reads
    // Postgres, so the document is restored to the current title either way.
    await db.insert(schema.outboxEvent).values([
      { aggregateType: 'story', aggregateId: story.id, eventType: 'replay', aggregateVersion: 1 },
      { aggregateType: 'story', aggregateId: story.id, eventType: 'replay', aggregateVersion: 1 },
    ])
    await db
      .update(schema.searchProjectionState)
      .set({ indexedVersion: 0 })
      .where(eq(schema.searchProjectionState.aggregateId, story.id))
    await processOutboxBatch(db, ts)
    const [current] = await db.select().from(schema.story).where(eq(schema.story.id, story.id))
    expect(stories?.get(story.id)?.title).toBe(current?.title)
  })

  it('removes withdrawn stories from the index', async () => {
    const { db, ts } = h.ctx
    const [story] = await db
      .select()
      .from(schema.story)
      .where(isNotNull(schema.story.publishedAt))
      .limit(1)
    if (!story) throw new Error('no story')
    await db.transaction(async (tx) => {
      await tx.update(schema.story).set({ publishedAt: null }).where(eq(schema.story.id, story.id))
      await touchStory(tx, story.id, 'story.withdrawn')
    })
    await processOutboxBatch(db, ts)
    expect(ts.collections.get('stories')?.has(story.id)).toBe(false)
    await projectAggregate(db, ts, 'story', story.id)
    expect(ts.collections.get('stories')?.has(story.id)).toBe(false)
  })
})

describe('stale jobs', () => {
  it('skips analysis jobs whose input fingerprint is no longer current', async () => {
    const { db } = h.ctx
    const [row] = await db.select().from(schema.articleEmbedding).limit(1)
    if (!row) throw new Error('no embedding')
    const { embedArticles, matchArticle, summarizeStory } = await import('@dn/jobs')
    const job = {
      targetId: row.articleId,
      inputFingerprint: 'rev_outdated',
      pipelineVersion: 'p2',
      priorityClass: 'fresh' as const,
    }
    await embedArticles(h.ctx, [{ id: 'x', name: 'embed_article', data: job } as never])
    const [after] = await db
      .select()
      .from(schema.articleEmbedding)
      .where(eq(schema.articleEmbedding.articleId, row.articleId))
    expect(after?.createdAt.getTime()).toBe(row.createdAt.getTime())
    expect(await matchArticle(h.ctx, job)).toEqual({ status: 'stale' })
    expect(await summarizeStory(h.ctx, { ...job, targetId: 'sty_missing' })).toEqual({
      status: 'stale',
    })
  })
})
