import { schema } from '@dn/db'
import { feedIds, pollFeed, seedPublishers } from '@dn/jobs'
import {
  editSummary,
  getStory,
  getStoryLead,
  processOutboxBatch,
  projectAggregate,
  recordGeneratedSummary,
  storyInputFingerprint,
  touchStory,
} from '@dn/server'
import { and, count, eq, inArray, isNotNull, isNull } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { drainPipeline } from './drain.ts'
import { createFakeTypesense, createTestContext, truncateAll } from './harness.ts'

let h: Awaited<ReturnType<typeof createTestContext>>
const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0

// pg-boss queue stats are cached by its supervisor; count job rows directly.
async function pendingJobs() {
  const { rows } = await h.ctx.pool.query(
    `select count(*)::int as n from pgboss.job where state in ('created', 'retry', 'active')`,
  )
  return rows[0].n as number
}

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
      expect(story.regions.length).toBeGreaterThan(0)
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

  it('links related stories into at least one narrative', async () => {
    const { db } = h.ctx
    expect(await n(db.select({ n: count() }).from(schema.storyRelationship))).toBeGreaterThan(0)
    expect(await n(db.select({ n: count() }).from(schema.narrativeStory))).toBeGreaterThan(1)
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
    const jobsBefore = await pendingJobs()
    const before = {
      articles: await n(db.select({ n: count() }).from(schema.article)),
      revisions: await n(db.select({ n: count() }).from(schema.articleRevision)),
      observations: await n(db.select({ n: count() }).from(schema.observation)),
    }
    await pollAll()
    expect(await n(db.select({ n: count() }).from(schema.article))).toBe(before.articles)
    expect(await n(db.select({ n: count() }).from(schema.articleRevision))).toBe(before.revisions)
    expect(await n(db.select({ n: count() }).from(schema.observation))).toBe(before.observations)
    expect(await pendingJobs()).toBe(jobsBefore)
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

  it('re-summarises stories whose articles were revised', async () => {
    const { db } = h.ctx
    const stories = await db.select().from(schema.story).where(isNotNull(schema.story.publishedAt))
    for (const story of stories) {
      expect(story.inputFingerprint).toBe(await storyInputFingerprint(db, story.id))
      const [current] = await db
        .select()
        .from(schema.storySummaryVersion)
        .where(eq(schema.storySummaryVersion.id, story.currentSummaryId ?? ''))
      expect(current?.inputFingerprint).toBe(story.inputFingerprint)
    }
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
      .select({ story: schema.story })
      .from(schema.story)
      .innerJoin(schema.storyContext, eq(schema.storyContext.storyId, schema.story.id))
      .where(isNotNull(schema.story.publishedAt))
      .limit(1)
    if (!story?.story.currentSummaryId) throw new Error('no published story with context')
    const currentStory = story.story
    const previous = currentStory.currentSummaryId
    const versionId = await db.transaction((tx) =>
      editSummary(tx, {
        storyId: currentStory.id,
        basedOnVersionId: previous,
        headline: 'Edited headline',
        body: 'Edited body.',
        userId: 'user_test',
      }),
    )
    const [after] = await db.select().from(schema.story).where(eq(schema.story.id, currentStory.id))
    expect(after?.currentSummaryId).toBe(versionId)
    expect(
      await db
        .select()
        .from(schema.storyContext)
        .where(eq(schema.storyContext.storyId, currentStory.id)),
    ).toHaveLength(0)
    expect(
      await db
        .select()
        .from(schema.claim)
        .where(and(eq(schema.claim.storyId, currentStory.id), isNull(schema.claim.supersededAt))),
    ).toHaveLength(0)
    const [old] = await db
      .select()
      .from(schema.storySummaryVersion)
      .where(eq(schema.storySummaryVersion.id, previous))
    expect(old).toBeDefined()
    await expect(
      db.transaction((tx) =>
        editSummary(tx, {
          storyId: currentStory.id,
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
          regions: ['global'],
          desk: 'politics',
        },
        analysisRunId: 'run_none',
        inputFingerprint: 'outdated-fingerprint',
      }),
    )
    expect(result).toEqual({ status: 'stale' })
    expect(await storyInputFingerprint(db, story.id)).toBe(story.inputFingerprint)
    const [after] = await db.select().from(schema.story).where(eq(schema.story.id, story.id))
    expect(after?.currentSummaryId).toBe(story.currentSummaryId)
    const versions = await n(
      db
        .select({ n: count() })
        .from(schema.storySummaryVersion)
        .where(eq(schema.storySummaryVersion.headline, 'Stale')),
    )
    expect(versions).toBe(0)
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
            regions: ['global'],
            desk: 'politics',
          },
          analysisRunId: 'run_none',
          inputFingerprint: 'fp_new',
        })
      }),
    ).rejects.toThrow(/unlinked articles/)
  })
})

describe('desks', () => {
  it('stores a desk on every generated summary', async () => {
    const missing = await n(
      h.ctx.db
        .select({ n: count() })
        .from(schema.story)
        .where(and(isNotNull(schema.story.publishedAt), isNull(schema.story.desk))),
    )
    expect(missing).toBe(0)
  })

  it('re-summarises unchanged inputs only while the Story has no desk', async () => {
    const { db } = h.ctx
    const [story] = await db
      .select()
      .from(schema.story)
      .where(isNotNull(schema.story.publishedAt))
      .limit(1)
    if (!story?.inputFingerprint) throw new Error('no story')
    const links = await db
      .select({ articleId: schema.storyArticle.articleId })
      .from(schema.storyArticle)
      .where(and(eq(schema.storyArticle.storyId, story.id), isNull(schema.storyArticle.removedAt)))
    const articleIds = links.map((l) => l.articleId)
    const observations = await db
      .select({ id: schema.observation.id })
      .from(schema.observation)
      .where(inArray(schema.observation.subjectId, articleIds))
    const [run] = await db.select({ id: schema.analysisRun.id }).from(schema.analysisRun).limit(1)
    const statuses: string[] = []
    // Rolled back at the end so later tests see the original summary.
    await expect(
      db.transaction(async (tx) => {
        const record = async () =>
          (
            await recordGeneratedSummary(tx, {
              storyId: story.id,
              output: {
                headline: story.title,
                summary: 'Refreshed.',
                detail: 'More.',
                sourceArticleIds: articleIds,
                observationIds: observations.map((o) => o.id),
                regions: ['global'],
                desk: 'science',
              },
              analysisRunId: run?.id,
              inputFingerprint: story.inputFingerprint ?? '',
            })
          ).status
        statuses.push(await record())
        await tx.update(schema.story).set({ desk: null }).where(eq(schema.story.id, story.id))
        statuses.push(await record())
        const [after] = await tx.select().from(schema.story).where(eq(schema.story.id, story.id))
        statuses.push(after?.desk ?? 'none')
        statuses.push(await record())
        tx.rollback()
      }),
    ).rejects.toThrow()
    expect(statuses).toEqual(['stale', 'recorded', 'science', 'stale'])
  })

  it('stores detail paragraphs with every generated summary', async () => {
    const rows = await h.ctx.db
      .select({ detail: schema.storySummaryVersion.detail })
      .from(schema.story)
      .innerJoin(
        schema.storySummaryVersion,
        eq(schema.storySummaryVersion.id, schema.story.currentSummaryId),
      )
      .where(isNull(schema.storySummaryVersion.editedByUserId))
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) expect(r.detail?.split('\n\n').length).toBeGreaterThan(1)
  })

  it('numbers citations across summary and detail together, and forced refreshes replace', async () => {
    const { db } = h.ctx
    const stories = await db.select().from(schema.story).where(isNotNull(schema.story.publishedAt))
    let picked: { story: (typeof stories)[number]; articleIds: string[] } | undefined
    for (const story of stories) {
      const links = await db
        .select({ articleId: schema.storyArticle.articleId })
        .from(schema.storyArticle)
        .where(
          and(eq(schema.storyArticle.storyId, story.id), isNull(schema.storyArticle.removedAt)),
        )
      if (links.length >= 2) {
        picked = { story, articleIds: links.map((l) => l.articleId) }
        break
      }
    }
    if (!picked?.story.inputFingerprint) throw new Error('no story with two articles')
    const { story, articleIds } = picked
    const [a, b] = articleIds as [string, string]
    const observations = await db
      .select({ id: schema.observation.id })
      .from(schema.observation)
      .where(inArray(schema.observation.subjectId, [a, b]))
    const [run] = await db.select({ id: schema.analysisRun.id }).from(schema.analysisRun).limit(1)
    let result: unknown
    // Rolled back at the end so later tests see the original summary.
    await expect(
      db.transaction(async (tx) => {
        const record = (force: boolean) =>
          recordGeneratedSummary(tx, {
            storyId: story.id,
            output: {
              headline: story.title,
              // Shown as [2] and [3]; an uncited first source shifts the display numbers down.
              summary: 'A happened[3].',
              detail: 'B said so[2].\n\nC disagreed[3].',
              sourceArticleIds: [a, b],
              observationIds: observations.map((o) => o.id),
              regions: ['global'],
              desk: 'science',
              topics: [],
            },
            analysisRunId: run?.id ?? '',
            inputFingerprint: story.inputFingerprint ?? '',
            shownArticleIds: ['art_not_cited', a, b],
            force,
          })
        const unforced = await record(false)
        const forced = await record(true)
        if (forced.status !== 'recorded') throw new Error('not recorded')
        const [version] = await tx
          .select()
          .from(schema.storySummaryVersion)
          .where(eq(schema.storySummaryVersion.id, forced.versionId))
        const sources = await tx
          .select({
            articleId: schema.storySummarySource.articleId,
            citation: schema.storySummarySource.citation,
          })
          .from(schema.storySummarySource)
          .where(eq(schema.storySummarySource.summaryVersionId, forced.versionId))
        result = {
          unforced: unforced.status,
          body: version?.body,
          detail: version?.detail,
          citations: Object.fromEntries(sources.map((s) => [s.articleId, s.citation])),
        }
        tx.rollback()
      }),
    ).rejects.toThrow()
    expect(result).toEqual({
      unforced: 'stale',
      body: 'A happened[2].',
      detail: 'B said so[1].\n\nC disagreed[2].',
      citations: { [a]: 1, [b]: 2 },
    })
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

  it('ignores events older than the version already indexed', async () => {
    const { db, ts } = h.ctx
    const [story] = await db
      .select()
      .from(schema.story)
      .where(isNotNull(schema.story.publishedAt))
      .limit(1)
    if (!story) throw new Error('no story')
    await processOutboxBatch(db, ts)
    const stories = ts.collections.get('stories')
    const doc = stories?.get(story.id)
    if (!doc) throw new Error('story not indexed')
    // Sentinel: if the stale event triggers a re-projection, the title is overwritten.
    stories?.set(story.id, { ...doc, title: 'SENTINEL' })
    await db.insert(schema.outboxEvent).values({
      aggregateType: 'story',
      aggregateId: story.id,
      eventType: 'late',
      aggregateVersion: 1,
    })
    await processOutboxBatch(db, ts)
    expect(stories?.get(story.id)?.title).toBe('SENTINEL')
    stories?.set(story.id, doc)
  })

  it('backs off and keeps failed events pending instead of marking them processed', async () => {
    const { db, ts } = h.ctx
    const [story] = await db
      .select()
      .from(schema.story)
      .where(isNotNull(schema.story.publishedAt))
      .limit(1)
    if (!story) throw new Error('no story')
    await processOutboxBatch(db, ts)
    const [event] = await db
      .insert(schema.outboxEvent)
      .values({
        aggregateType: 'story',
        aggregateId: story.id,
        eventType: 'retry-me',
        aggregateVersion: 999,
      })
      .returning()
    const upsert = ts.upsert
    ts.upsert = async () => {
      throw new Error('typesense down')
    }
    try {
      expect(await processOutboxBatch(db, ts)).toMatchObject({ failed: 1, processed: 0 })
    } finally {
      ts.upsert = upsert
    }
    const [after] = await db
      .select()
      .from(schema.outboxEvent)
      .where(eq(schema.outboxEvent.id, event?.id ?? 0))
    expect(after?.processedAt).toBeNull()
    expect(after?.attempts).toBe(1)
    expect(after?.lastError).toMatch(/typesense down/)
    expect(after?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
    // Not due yet: a second pass must not pick it up.
    expect((await processOutboxBatch(db, ts)).fetched).toBe(0)
    await db
      .update(schema.outboxEvent)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(schema.outboxEvent.id, event?.id ?? 0))
    expect(await processOutboxBatch(db, ts)).toMatchObject({ processed: 1 })
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
    const [story] = await db
      .select()
      .from(schema.story)
      .where(isNotNull(schema.story.publishedAt))
      .limit(1)
    if (!story) throw new Error('no story')
    const versionCount = () =>
      n(
        db
          .select({ n: count() })
          .from(schema.storySummaryVersion)
          .where(eq(schema.storySummaryVersion.storyId, story.id)),
      )
    const versionsBefore = await versionCount()
    expect(await summarizeStory(h.ctx, { ...job, targetId: story.id })).toEqual({ status: 'stale' })
    expect(await versionCount()).toBe(versionsBefore)
  })
})

describe('stale inference races', () => {
  it('does not store an embedding when a newer revision lands during the inference call', async () => {
    const { db } = h.ctx
    const [row] = await db.select().from(schema.articleEmbedding).limit(1)
    if (!row) throw new Error('no embedding')
    const [article] = await db
      .select()
      .from(schema.article)
      .where(eq(schema.article.id, row.articleId))
    const { embedArticles } = await import('@dn/jobs')
    const original = h.ctx.inference.embeddings.embedDocuments
    h.ctx.inference.embeddings.embedDocuments = async (docs) => {
      // A newer revision is ingested while the old one is being embedded.
      await h.ctx.pool.query(`update article set latest_revision_id = 'rev_newer' where id = $1`, [
        row.articleId,
      ])
      return original(docs)
    }
    try {
      const job = {
        targetId: row.articleId,
        inputFingerprint: article?.latestRevisionId ?? '',
        pipelineVersion: 'p2',
        priorityClass: 'fresh' as const,
      }
      await embedArticles(h.ctx, [{ id: 'x', name: 'embed_article', data: job } as never])
      const [after] = await db
        .select()
        .from(schema.articleEmbedding)
        .where(eq(schema.articleEmbedding.articleId, row.articleId))
      expect(after?.createdAt.getTime()).toBe(row.createdAt.getTime())
    } finally {
      h.ctx.inference.embeddings.embedDocuments = original
      await h.ctx.pool.query('update article set latest_revision_id = $2 where id = $1', [
        row.articleId,
        article?.latestRevisionId,
      ])
    }
  })
})

describe('publish threshold', () => {
  it('summarises only Stories covered by enough newsrooms; official sources do not count', async () => {
    const { summarizeStory } = await import('@dn/jobs')
    const { newsroomOutletCount } = await import('@dn/server')
    // Any published Story with several newsrooms. Fixture grouping varies from run to run,
    // so the threshold is set to this Story's own outlet count rather than a fixed 2.
    const { rows } = await h.ctx.pool.query(
      `select s.id, s.input_fingerprint, min(a.publisher_id) as publisher_id,
         count(distinct a.publisher_id)::int as outlets
       from story s join story_article sa on sa.story_id = s.id and sa.removed_at is null
       join article a on a.id = sa.article_id
       where s.published_at is not null
       group by s.id having count(distinct a.publisher_id) >= 2 limit 1`,
    )
    const story = rows[0] as {
      id: string
      input_fingerprint: string
      publisher_id: string
      outlets: number
    }
    if (!story) throw new Error('no multi-outlet story')
    const job = {
      targetId: story.id,
      inputFingerprint: story.input_fingerprint,
      pipelineVersion: 'p2',
      priorityClass: 'fresh' as const,
    }
    expect(await newsroomOutletCount(h.ctx.db, story.id)).toBe(story.outlets)

    h.ctx.config.minPublishOutlets = story.outlets
    try {
      // Already summarised for these inputs, so it passes the gate and is then a no-op.
      expect(await summarizeStory(h.ctx, job)).toEqual({ status: 'stale' })
      await h.ctx.pool.query(`update publisher set kind = 'official' where id = $1`, [
        story.publisher_id,
      ])
      expect(await newsroomOutletCount(h.ctx.db, story.id)).toBe(story.outlets - 1)
      expect(await summarizeStory(h.ctx, job)).toEqual({ status: 'below_outlet_threshold' })
    } finally {
      h.ctx.config.minPublishOutlets = 1
      await h.ctx.pool.query(`update publisher set kind = 'newsroom' where id = $1`, [
        story.publisher_id,
      ])
    }
  })
})

describe('official sources as evidence', () => {
  it('links official articles to their Story as primary sources', async () => {
    const { summarizeStory } = await import('@dn/jobs')
    const { rows } = await h.ctx.pool.query(
      `select s.id, min(a.publisher_id) as publisher_id
       from story s join story_article sa on sa.story_id = s.id and sa.removed_at is null
       join article a on a.id = sa.article_id
       where s.published_at is not null
       group by s.id having count(distinct a.publisher_id) >= 2 limit 1`,
    )
    const story = rows[0] as { id: string; publisher_id: string }
    if (!story) throw new Error('no multi-outlet story')
    await h.ctx.pool.query(`update publisher set kind = 'official' where id = $1`, [
      story.publisher_id,
    ])
    try {
      // New inputs, so the job records a fresh summary version.
      await h.ctx.pool.query(`update story set input_fingerprint = 'fp_official' where id = $1`, [
        story.id,
      ])
      const job = {
        targetId: story.id,
        inputFingerprint: 'fp_official',
        pipelineVersion: 'p2',
        priorityClass: 'fresh' as const,
      }
      expect((await summarizeStory(h.ctx, job)).status).toBe('recorded')
      const refs = async () =>
        (
          await h.ctx.pool.query(
            `select sr.url from story_source_reference ssr
             join source_reference sr on sr.id = ssr.source_reference_id
             where ssr.story_id = $1 and sr.kind = 'official_statement'`,
            [story.id],
          )
        ).rows.map((r) => r.url)
      const { rows: official } = await h.ctx.pool.query(
        `select a.canonical_url as url from story_article sa join article a on a.id = sa.article_id
         where sa.story_id = $1 and sa.removed_at is null and a.publisher_id = $2`,
        [story.id, story.publisher_id],
      )
      const expected = official.map((r) => r.url).sort()
      expect((await refs()).sort()).toEqual(expected)

      // Summarising again adds no duplicate links.
      await h.ctx.pool.query(`update story set input_fingerprint = 'fp_official_2' where id = $1`, [
        story.id,
      ])
      await summarizeStory(h.ctx, { ...job, inputFingerprint: 'fp_official_2' })
      expect((await refs()).sort()).toEqual(expected)
    } finally {
      await h.ctx.pool.query(`update publisher set kind = 'newsroom' where id = $1`, [
        story.publisher_id,
      ])
    }
  })
})

describe('backfill admission', () => {
  it('admits nothing while paused and admits pending articles when resumed', async () => {
    const { db } = h.ctx
    const { admitBackfill } = await import('@dn/jobs')
    const { setBackfillPaused } = await import('@dn/server')
    const [article] = await db.select().from(schema.article).limit(1)
    if (!article) throw new Error('no article')
    await db
      .update(schema.article)
      .set({ pipelineState: 'pending_backfill' })
      .where(eq(schema.article.id, article.id))
    await setBackfillPaused(h.ctx, true)
    expect(await admitBackfill(h.ctx)).toEqual({ admitted: 0, paused: true })
    await setBackfillPaused(h.ctx, false)
    expect((await admitBackfill(h.ctx)).admitted).toBeGreaterThanOrEqual(1)
    const [after] = await db.select().from(schema.article).where(eq(schema.article.id, article.id))
    expect(after?.pipelineState).toBe('queued')
    await drainPipeline(h.ctx)
  })
})

describe('event retention', () => {
  it('prunes delivered events past retention and keeps pending ones', async () => {
    const { db } = h.ctx
    const { pruneDeliveredEvents } = await import('@dn/server')
    const old = new Date(Date.now() - 30 * 86_400_000)
    const [delivered, pending] = await db
      .insert(schema.outboxEvent)
      .values([
        {
          aggregateType: 'story',
          aggregateId: 'x',
          eventType: 'old',
          aggregateVersion: 1,
          processedAt: old,
        },
        {
          aggregateType: 'story',
          aggregateId: 'y',
          eventType: 'pending',
          aggregateVersion: 1,
          createdAt: old,
        },
      ])
      .returning()
    await pruneDeliveredEvents(db, 7)
    const remaining = await db.select({ id: schema.outboxEvent.id }).from(schema.outboxEvent)
    const ids = remaining.map((r) => r.id)
    expect(ids).not.toContain(delivered?.id)
    expect(ids).toContain(pending?.id)
    await db.delete(schema.outboxEvent).where(eq(schema.outboxEvent.id, pending?.id ?? 0))
  })
})

describe('concurrent matching', () => {
  it('puts two near-identical articles matched at the same time into one story', async () => {
    const { db, ts } = h.ctx
    const { matchArticle, resumeMatchFollower } = await import('@dn/jobs')
    const { ID_PREFIX, newId } = await import('@dn/domain')
    const [publisher] = await db.select().from(schema.publisher).limit(1)
    if (!publisher) throw new Error('no publisher')
    const title = 'Glaciologists confirm record-breaking Antarctic ice shelf collapse near Thwaites'
    const now = new Date()
    const pairVector = [1, ...Array.from({ length: 767 }, () => 0)]
    const candidateVector = [0.5, Math.sqrt(0.75), ...Array.from({ length: 766 }, () => 0)]
    const candidateId = newId(ID_PREFIX.article)
    const candidateRevisionId = newId(ID_PREFIX.articleRevision)
    await db.insert(schema.article).values({
      id: candidateId,
      publisherId: publisher.id,
      canonicalUrl: `https://example.com/older-ice-${candidateId}`,
      firstSeenAt: new Date(now.getTime() - 3_600_000),
      publishedAt: new Date(now.getTime() - 3_600_000),
      pipelineState: 'matched',
    })
    await db.insert(schema.articleRevision).values({
      id: candidateRevisionId,
      articleId: candidateId,
      observedAt: now,
      title: 'Scientists monitor a separate Antarctic ice shelf fracture',
      description: 'A nearby shelf remains under observation.',
      contentHash: `h-${candidateId}`,
    })
    await db
      .update(schema.article)
      .set({ latestRevisionId: candidateRevisionId })
      .where(eq(schema.article.id, candidateId))
    await db.insert(schema.observation).values({
      id: newId(ID_PREFIX.observation),
      type: 'article_discovered',
      observedAt: now,
      sourceUrl: `https://example.com/older-ice-${candidateId}`,
      collectionMethod: 'rss',
      subjectType: 'article',
      subjectId: candidateId,
      payload: { revisionId: candidateRevisionId },
      schemaVersion: 1,
    })
    await db.insert(schema.articleEmbedding).values({
      articleId: candidateId,
      revisionId: candidateRevisionId,
      modelId: 'test',
      inputFingerprint: candidateRevisionId,
      embedding: candidateVector,
    })
    const { createStoryWithArticle } = await import('@dn/server')
    await createStoryWithArticle(db, {
      articleId: candidateId,
      title: 'Scientists monitor a separate Antarctic ice shelf fracture',
      observedAt: now,
      matchMethod: 'new_story',
    })
    await db.insert(schema.outboxEvent).values({
      aggregateType: 'article',
      aggregateId: candidateId,
      eventType: 'article.embedded',
      aggregateVersion: 1,
    })
    const ids: string[] = []
    for (const suffix of ['a', 'b']) {
      const articleId = newId(ID_PREFIX.article)
      const revisionId = newId(ID_PREFIX.articleRevision)
      await db.insert(schema.article).values({
        id: articleId,
        publisherId: publisher.id,
        canonicalUrl: `https://example.com/ice-${suffix}-${articleId}`,
        firstSeenAt: now,
        publishedAt: now,
        pipelineState: 'embedded',
      })
      await db.insert(schema.articleRevision).values({
        id: revisionId,
        articleId,
        observedAt: now,
        title,
        description: 'Researchers report the collapse in a new survey.',
        contentHash: `h-${articleId}`,
      })
      await db
        .update(schema.article)
        .set({ latestRevisionId: revisionId })
        .where(eq(schema.article.id, articleId))
      await db.insert(schema.observation).values({
        id: newId(ID_PREFIX.observation),
        type: 'article_discovered',
        observedAt: now,
        sourceUrl: `https://example.com/ice-${suffix}`,
        collectionMethod: 'rss',
        subjectType: 'article',
        subjectId: articleId,
        payload: { revisionId },
        schemaVersion: 1,
      })
      await db.insert(schema.articleEmbedding).values({
        articleId,
        revisionId,
        modelId: 'test',
        inputFingerprint: revisionId,
        embedding: pairVector,
      })
      await db.insert(schema.outboxEvent).values({
        aggregateType: 'article',
        aggregateId: articleId,
        eventType: 'article.embedded',
        aggregateVersion: 1,
      })
      ids.push(articleId)
    }
    await processOutboxBatch(db, ts)
    const jobs = await Promise.all(
      ids.map(async (id) => {
        const [a] = await db.select().from(schema.article).where(eq(schema.article.id, id))
        return {
          targetId: id,
          inputFingerprint: a?.latestRevisionId ?? '',
          pipelineVersion: 'p2',
          priorityClass: 'fresh' as const,
        }
      }),
    )
    const realChooseStory = h.ctx.inference.generation.chooseStory
    let entered: (() => void) | undefined
    let release: (() => void) | undefined
    const choosing = new Promise<void>((resolve) => {
      entered = resolve
    })
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    const chooseStory = vi
      .spyOn(h.ctx.inference.generation, 'chooseStory')
      .mockImplementation(async (input) => {
        entered?.()
        await blocked
        return realChooseStory(input)
      })
    const [leader, follower] = jobs.sort((a, b) => a.targetId.localeCompare(b.targetId))
    if (!leader || !follower) throw new Error('concurrent jobs missing')
    const leaderResult = matchArticle(h.ctx, leader)
    await choosing
    expect(await matchArticle(h.ctx, follower)).toMatchObject({ status: 'deferred' })
    release?.()
    expect(await leaderResult).toMatchObject({ status: 'new_story' })
    expect(
      await resumeMatchFollower(h.ctx, { ...follower, inputFingerprint: 'stale-wake' }),
    ).toMatchObject({ status: 'leader_matched' })
    const { rows: resumed } = await h.ctx.pool.query<{ fingerprint: string }>(
      `select data->>'inputFingerprint' as fingerprint from pgboss.job
       where name = 'match_article' and data->>'targetId' = $1 order by created_on desc limit 1`,
      [follower.targetId],
    )
    expect(resumed[0]?.fingerprint).toBe(follower.inputFingerprint)
    expect(await matchArticle(h.ctx, follower)).toMatchObject({ status: 'attached' })
    expect(chooseStory).toHaveBeenCalledTimes(1)
    chooseStory.mockRestore()
    const memberships = await db
      .select({ storyId: schema.storyArticle.storyId })
      .from(schema.storyArticle)
      .where(
        and(inArray(schema.storyArticle.articleId, ids), isNull(schema.storyArticle.removedAt)),
      )
    expect(memberships).toHaveLength(2)
    expect(new Set(memberships.map((m) => m.storyId)).size).toBe(1)
    await drainPipeline(h.ctx)
  })
})

describe('summary debounce', () => {
  it('keeps one pending wake-up and releases only the latest Story fingerprint', async () => {
    const { withTransaction } = await import('@dn/db')
    const { newId, ID_PREFIX } = await import('@dn/domain')
    const { debounceStorySummary, reconcileSummaryDebounces, releaseSummaryDebounce } =
      await import('@dn/jobs')
    const storyId = newId(ID_PREFIX.story)
    await h.ctx.db.insert(schema.story).values({
      id: storyId,
      slug: `debounce-${storyId}`,
      title: 'Debounce test Story',
      firstObservedAt: new Date(),
      lastUpdatedAt: new Date(),
      inputFingerprint: 'fingerprint-1',
    })
    const schedule = (priorityClass: 'backfill' | 'fresh' | 'interactive') =>
      withTransaction(h.ctx.pool, (tx) => debounceStorySummary(h.ctx, tx, storyId, priorityClass))
    expect(await schedule('backfill')).toMatchObject({ status: 'scheduled' })
    await expect(
      releaseSummaryDebounce(h.ctx, {
        targetId: storyId,
        inputFingerprint: 'fingerprint-1',
        pipelineVersion: 'p2',
        priorityClass: 'backfill',
      }),
    ).rejects.toThrow(/wake already active/)
    expect(
      await h.ctx.db
        .select()
        .from(schema.summaryDebounce)
        .where(eq(schema.summaryDebounce.storyId, storyId)),
    ).toHaveLength(1)
    await h.ctx.pool.query(
      `delete from pgboss.job where name = 'release_summary_debounce' and data->>'targetId' = $1`,
      [storyId],
    )
    await h.ctx.db
      .update(schema.summaryDebounce)
      .set({ dueAt: new Date(Date.now() - 1000) })
      .where(eq(schema.summaryDebounce.storyId, storyId))
    expect(await reconcileSummaryDebounces(h.ctx)).toBe(1)
    await h.ctx.db
      .update(schema.story)
      .set({ inputFingerprint: 'fingerprint-2' })
      .where(eq(schema.story.id, storyId))
    expect(await schedule('fresh')).toMatchObject({ status: 'extended' })
    expect(
      await h.ctx.db
        .select({ priorityClass: schema.summaryDebounce.priorityClass })
        .from(schema.summaryDebounce)
        .where(eq(schema.summaryDebounce.storyId, storyId)),
    ).toEqual([{ priorityClass: 'fresh' }])
    const { rows: wakes } = await h.ctx.pool.query<{ n: number }>(
      `select count(*)::int as n from pgboss.job where name = 'release_summary_debounce' and data->>'targetId' = $1`,
      [storyId],
    )
    expect(wakes[0]?.n).toBe(1)
    await h.ctx.db
      .update(schema.summaryDebounce)
      .set({ dueAt: new Date(Date.now() - 1000) })
      .where(eq(schema.summaryDebounce.storyId, storyId))
    expect(
      await releaseSummaryDebounce(h.ctx, {
        targetId: storyId,
        inputFingerprint: 'fingerprint-1',
        pipelineVersion: 'p2',
        priorityClass: 'fresh',
      }),
    ).toEqual({ status: 'released', inputFingerprint: 'fingerprint-2' })
    const { rows: summaries } = await h.ctx.pool.query<{ fingerprint: string }>(
      `select data->>'inputFingerprint' as fingerprint from pgboss.job where name = 'build_story_summary' and data->>'targetId' = $1 order by created_on desc`,
      [storyId],
    )
    expect(summaries[0]?.fingerprint).toBe('fingerprint-2')
    await h.ctx.db
      .update(schema.story)
      .set({ inputFingerprint: 'fingerprint-3' })
      .where(eq(schema.story.id, storyId))
    expect(await schedule('fresh')).toMatchObject({ status: 'scheduled' })
    expect(await schedule('interactive')).toEqual({ status: 'immediate' })
    expect(
      await h.ctx.db
        .select()
        .from(schema.summaryDebounce)
        .where(eq(schema.summaryDebounce.storyId, storyId)),
    ).toHaveLength(0)
    await h.ctx.pool.query(`delete from pgboss.job where data->>'targetId' = $1`, [storyId])
    await h.ctx.db.delete(schema.story).where(eq(schema.story.id, storyId))
  })
})

describe('lazy optional enrichment', () => {
  it('admits missing current work once and stops on success or failure', async () => {
    const { PROMPT_VERSIONS } = await import('@dn/inference')
    const { ensureOptionalEnrichment, QUEUES } = await import('@dn/server')
    const [story] = await h.ctx.db
      .select({ id: schema.story.id, summaryId: schema.story.currentSummaryId })
      .from(schema.story)
      .where(isNotNull(schema.story.publishedAt))
      .limit(1)
    if (!story?.summaryId) throw new Error('no published story')
    const modelId = 'lazy-enrichment-test-model'
    const ctx = {
      ...h.ctx,
      inference: {
        ...h.ctx.inference,
        generation: { ...h.ctx.inference.generation, modelId },
      },
    }
    expect(await ensureOptionalEnrichment(ctx, story.id, story.summaryId)).toEqual({
      context: 'pending',
      claims: 'pending',
    })
    await ensureOptionalEnrichment(ctx, story.id, story.summaryId)
    const { rows: queued } = await h.ctx.pool.query<{ name: string; n: number }>(
      `select name, count(*)::int as n from pgboss.job
       where name in ($1, $2) and data->>'targetId' = $3 and state in ('created', 'retry', 'active')
       group by name order by name`,
      [QUEUES.generateContext, QUEUES.extractClaims, story.id],
    )
    expect(queued).toEqual([
      { name: QUEUES.extractClaims, n: 1 },
      { name: QUEUES.generateContext, n: 1 },
    ])

    await h.ctx.db.insert(schema.optionalEnrichmentCompletion).values({
      storyId: story.id,
      summaryVersionId: story.summaryId,
      kind: 'context',
      modelId,
      promptVersion: PROMPT_VERSIONS.explainContext,
    })
    await h.ctx.pool.query(
      `update pgboss.job set state = 'failed', completed_on = now()
       where name = $1 and data->>'targetId' = $2 and data->>'modelId' = $3`,
      [QUEUES.extractClaims, story.id, modelId],
    )
    expect(await ensureOptionalEnrichment(ctx, story.id, story.summaryId)).toEqual({
      context: 'ready',
      claims: 'failed',
    })
    await h.ctx.pool.query(
      `delete from pgboss.job where name in ($1, $2) and data->>'targetId' = $3 and data->>'modelId' = $4`,
      [QUEUES.generateContext, QUEUES.extractClaims, story.id, modelId],
    )
    await h.ctx.db
      .delete(schema.optionalEnrichmentCompletion)
      .where(eq(schema.optionalEnrichmentCompletion.storyId, story.id))
  })
})

describe('incremental relationships', () => {
  it('reuses exact Story embeddings and relationship decisions', async () => {
    const { relateStory } = await import('@dn/jobs')
    const { rows: edges } = await h.ctx.pool.query<{
      id: string
      from_story_id: string
      to_story_id: string
      analysis_run_id: string
    }>(`select r.id, r.from_story_id, r.to_story_id, r.analysis_run_id
        from story_relationship r
        join analysis_run a on a.id = r.analysis_run_id
        join story newer on newer.id = r.from_story_id
        join story older on older.id = r.to_story_id
        where r.relation in ('related_to', 'provides_context_for')
          and a.input_fingerprint = newer.id || ':' || newer.current_summary_id || ':' ||
          newer.input_fingerprint || '|' || older.id || ':' || older.current_summary_id || ':' ||
          older.input_fingerprint
        limit 1`)
    const edge = edges[0]
    if (!edge) throw new Error('no current generated relationship')
    const [[newer], [older]] = await Promise.all([
      h.ctx.db
        .select({
          summaryId: schema.story.currentSummaryId,
          embedding: schema.story.embedding,
        })
        .from(schema.story)
        .where(eq(schema.story.id, edge.from_story_id)),
      h.ctx.db
        .select({ embedding: schema.story.embedding })
        .from(schema.story)
        .where(eq(schema.story.id, edge.to_story_id)),
    ])
    if (!newer?.summaryId || !newer.embedding || !older?.embedding)
      throw new Error('relationship cache inputs missing')
    const job = {
      targetId: edge.from_story_id,
      inputFingerprint: newer.summaryId,
      pipelineVersion: 'p2',
      priorityClass: 'fresh' as const,
    }
    const isolated = createFakeTypesense()
    await isolated.upsert('stories', { id: edge.to_story_id, embedding: older.embedding })
    const classify = vi.spyOn(h.ctx.inference.generation, 'classifyRelationship')
    const embed = vi.spyOn(h.ctx.inference.embeddings, 'embedDocuments')
    await h.ctx.db.delete(schema.storyRelationship).where(eq(schema.storyRelationship.id, edge.id))
    await relateStory({ ...h.ctx, ts: isolated }, job)
    expect(classify).not.toHaveBeenCalled()
    expect(embed).not.toHaveBeenCalled()
    expect(
      await h.ctx.db
        .select()
        .from(schema.storyRelationship)
        .where(
          and(
            eq(schema.storyRelationship.fromStoryId, edge.from_story_id),
            eq(schema.storyRelationship.toStoryId, edge.to_story_id),
          ),
        ),
    ).toHaveLength(1)

    await h.ctx.db
      .update(schema.analysisRun)
      .set({ promptVersion: 'classify-relationship@old' })
      .where(eq(schema.analysisRun.id, edge.analysis_run_id))
    await h.ctx.db
      .update(schema.story)
      .set({ embeddingModelId: 'old-model' })
      .where(eq(schema.story.id, edge.from_story_id))
    await h.ctx.db
      .delete(schema.storyRelationship)
      .where(
        and(
          eq(schema.storyRelationship.fromStoryId, edge.from_story_id),
          eq(schema.storyRelationship.toStoryId, edge.to_story_id),
        ),
      )
    await relateStory({ ...h.ctx, ts: isolated }, job)
    expect(classify).toHaveBeenCalledTimes(1)
    expect(embed).toHaveBeenCalledTimes(1)
    classify.mockRestore()
    embed.mockRestore()

    const realEmbed = h.ctx.inference.embeddings.embedDocuments
    let embeddingStarted: (() => void) | undefined
    let finishEmbedding: (() => void) | undefined
    const started = new Promise<void>((resolve) => {
      embeddingStarted = resolve
    })
    const finish = new Promise<void>((resolve) => {
      finishEmbedding = resolve
    })
    const staleEmbed = vi
      .spyOn(h.ctx.inference.embeddings, 'embedDocuments')
      .mockImplementation(async (documents) => {
        embeddingStarted?.()
        await finish
        return realEmbed(documents)
      })
    await h.ctx.db
      .update(schema.story)
      .set({ embeddingModelId: 'old-model' })
      .where(eq(schema.story.id, edge.from_story_id))
    const staleRun = relateStory({ ...h.ctx, ts: isolated }, job)
    await started
    await h.ctx.db
      .update(schema.story)
      .set({ currentSummaryId: 'sum_changed_during_embedding' })
      .where(eq(schema.story.id, edge.from_story_id))
    finishEmbedding?.()
    expect(await staleRun).toEqual({ status: 'stale' })
    const [afterStale] = await h.ctx.db
      .select({ modelId: schema.story.embeddingModelId })
      .from(schema.story)
      .where(eq(schema.story.id, edge.from_story_id))
    expect(afterStale?.modelId).toBe('old-model')
    staleEmbed.mockRestore()
    await h.ctx.db
      .update(schema.story)
      .set({
        currentSummaryId: newer.summaryId,
        embeddingModelId: h.ctx.inference.embeddings.modelId,
      })
      .where(eq(schema.story.id, edge.from_story_id))
  })
})

describe('story graph validation', () => {
  it('detects a cycle from the reachable edge subset', async () => {
    const { db } = h.ctx
    const { edgesForValidation } = await import('@dn/jobs')
    const { validateNewEdge, newId, ID_PREFIX } = await import('@dn/domain')
    // Stories with no existing relationships, so the only edges are the ones added here.
    const { rows: stories } = await h.ctx.pool.query<{ id: string }>(
      `select s.id from story s where s.published_at is not null and not exists (
         select 1 from story_relationship r where r.from_story_id = s.id or r.to_story_id = s.id
       ) order by s.id limit 3`,
    )
    const [a, b, c] = stories
    if (!a || !b || !c) throw new Error('need three stories')
    const inserted = await db
      .insert(schema.storyRelationship)
      .values([
        {
          id: newId(ID_PREFIX.storyRelationship),
          fromStoryId: b.id,
          toStoryId: c.id,
          relation: 'follows',
        },
        {
          id: newId(ID_PREFIX.storyRelationship),
          fromStoryId: c.id,
          toStoryId: a.id,
          relation: 'follows',
        },
      ])
      .onConflictDoNothing()
      .returning()
    try {
      const edges = await edgesForValidation(db, a.id, b.id)
      const verdict = validateNewEdge(
        { fromStoryId: a.id, toStoryId: b.id, relation: 'follows' },
        { fromFirstObservedAt: new Date('2100-01-01'), toFirstObservedAt: new Date('2000-01-01') },
        edges,
      )
      expect(verdict).toEqual({ ok: false, reason: 'cycle' })
    } finally {
      for (const e of inserted) {
        await db.delete(schema.storyRelationship).where(eq(schema.storyRelationship.id, e.id))
      }
    }
  })
})

describe('search rebuild', () => {
  it('rebuilds every published story into a fresh collection and swaps the alias', async () => {
    const { db, ts } = h.ctx
    const { rebuildSearchIndex } = await import('@dn/server')
    await rebuildSearchIndex(db, ts, () => {})
    const target = ts.aliases.get('stories')
    expect(target).toMatch(/^stories_/)
    const published = await n(
      db.select({ n: count() }).from(schema.story).where(isNotNull(schema.story.publishedAt)),
    )
    expect(ts.collections.get(target ?? '')?.size).toBe(published)
    // Later outbox processing writes through the alias into the rebuilt collection.
    await processOutboxBatch(db, ts)
    expect(ts.collections.get(target ?? '')?.size).toBe(published)
  })
})

describe('transient article bodies', () => {
  it('passes permitted bodies to inference but never persists them', async () => {
    const { db } = h.ctx
    const { summarizeStory } = await import('@dn/jobs')
    const MARKER = 'TRANSIENT-BODY-MARKER-7f3a'
    const [story] = await db
      .select()
      .from(schema.story)
      .where(isNotNull(schema.story.publishedAt))
      .limit(1)
    const [link] = await db
      .select({ publisherId: schema.article.publisherId })
      .from(schema.storyArticle)
      .innerJoin(schema.article, eq(schema.article.id, schema.storyArticle.articleId))
      .where(eq(schema.storyArticle.storyId, story?.id ?? ''))
    if (!story || !link) throw new Error('no story')
    await db
      .update(schema.publisher)
      .set({ articleBodyPolicy: 'transient_body_allowed' })
      .where(eq(schema.publisher.id, link.publisherId))
    await db
      .update(schema.story)
      .set({ inputFingerprint: 'fp_transient' })
      .where(eq(schema.story.id, story.id))

    const html = `<html><article><p>${MARKER} long enough paragraph about the event that a reader would see on the page.</p>
      <p>See <a href="https://www.congress.gov/bill/119th-congress/house-bill/1">the bill</a> for details here.</p></article></html>`
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(html, { headers: { 'content-type': 'text/html' } })) as typeof fetch
    const realSummarize = h.ctx.inference.generation.summarizeStory
    let bodySeenByModel = false
    h.ctx.inference.generation.summarizeStory = async (input) => {
      bodySeenByModel = input.story.articles.some((a) => a.body?.includes(MARKER))
      return realSummarize(input)
    }
    try {
      const result = await summarizeStory(h.ctx, {
        targetId: story.id,
        inputFingerprint: 'fp_transient',
        pipelineVersion: 'p2',
        priorityClass: 'fresh',
      })
      expect(result).toMatchObject({ status: 'recorded' })
    } finally {
      globalThis.fetch = realFetch
      h.ctx.inference.generation.summarizeStory = realSummarize
      await db
        .update(schema.publisher)
        .set({ articleBodyPolicy: 'metadata_only' })
        .where(eq(schema.publisher.id, link.publisherId))
    }
    expect(bodySeenByModel).toBe(true)

    const { rows } = await h.ctx.pool.query(
      `select
        (select count(*) from observation where payload::text like $1) +
        (select count(*) from interpretation where output::text like $1) +
        (select count(*) from story_summary_version where body like $1 or headline like $1) +
        (select count(*) from analysis_run where coalesce(error, '') like $1) +
        (select count(*) from outbox_event where payload::text like $1 or coalesce(last_error, '') like $1) +
        (select count(*) from pgboss.job where data::text like $1 or coalesce(output::text, '') like $1) as n`,
      [`%${MARKER}%`],
    )
    expect(Number(rows[0].n)).toBe(0)

    const refs = await db.select().from(schema.sourceReference)
    expect(refs.some((r) => r.url.includes('congress.gov'))).toBe(true)
  })
})

describe('narrative membership', () => {
  it('joins Stories through timeline links, not loose ones', async () => {
    const { db } = h.ctx
    const { narrativeComponent } = await import('@dn/jobs')
    const { newId, ID_PREFIX } = await import('@dn/domain')
    const { rows: stories } = await h.ctx.pool.query<{ id: string }>(
      `select s.id from story s where s.published_at is not null and not exists (
         select 1 from story_relationship r where r.from_story_id = s.id or r.to_story_id = s.id
       ) order by s.id limit 3`,
    )
    const [a, b, c] = stories
    if (!a || !b || !c) throw new Error('need three stories')
    const inserted = await db
      .insert(schema.storyRelationship)
      .values([
        {
          id: newId(ID_PREFIX.storyRelationship),
          fromStoryId: b.id,
          toStoryId: a.id,
          relation: 'related_to',
        },
        {
          id: newId(ID_PREFIX.storyRelationship),
          fromStoryId: c.id,
          toStoryId: a.id,
          relation: 'follows',
        },
      ])
      .returning()
    try {
      expect((await narrativeComponent(db, a.id)).sort()).toEqual([a.id, c.id].sort())
      expect(await narrativeComponent(db, b.id)).toEqual([b.id])
    } finally {
      for (const e of inserted) {
        await db.delete(schema.storyRelationship).where(eq(schema.storyRelationship.id, e.id))
      }
    }
  })
})

describe('story graph reset', () => {
  it('removes relationships and narratives and drops narratives from search', async () => {
    const { db, ts } = h.ctx
    const { resetStoryGraph } = await import('@dn/server')
    await processOutboxBatch(db, ts)
    const narratives = () => ts.collections.get(ts.aliases.get('narratives') ?? 'narratives')
    expect(narratives()?.size ?? 0).toBeGreaterThan(0)
    await resetStoryGraph(db)
    expect(await n(db.select({ n: count() }).from(schema.narrative))).toBe(0)
    expect(await n(db.select({ n: count() }).from(schema.storyRelationship))).toBe(0)
    for (let i = 0; i < 5 && (await processOutboxBatch(db, ts, 500)).fetched > 0; i++) {}
    expect(narratives()?.size ?? 0).toBe(0)
  })
})

describe('context popovers', () => {
  it('annotates summaries with grounded, reusable context entries', async () => {
    const { db } = h.ctx
    const links = await db.select().from(schema.storyContext)
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      const [story] = await db
        .select({
          body: schema.storySummaryVersion.body,
          detail: schema.storySummaryVersion.detail,
          editedBy: schema.storySummaryVersion.editedByUserId,
        })
        .from(schema.story)
        .innerJoin(
          schema.storySummaryVersion,
          eq(schema.storySummaryVersion.id, schema.story.currentSummaryId),
        )
        .where(eq(schema.story.id, link.storyId))
      // Human edits regenerate context asynchronously; generated summaries must match now.
      if (!story?.editedBy) expect(`${story?.body}\n\n${story?.detail}`).toContain(link.anchorText)
    }
    // Shared subjects are stored once.
    const keys = await db
      .select({ key: schema.contextEntry.normalizedKey })
      .from(schema.contextEntry)
    expect(new Set(keys.map((k) => k.key)).size).toBe(keys.length)
  })

  it('keeps anchors found only in the detail, for the Story page but not the lead', async () => {
    const { db } = h.ctx
    const links = await db
      .select({
        storyId: schema.storyContext.storyId,
        anchorText: schema.storyContext.anchorText,
        body: schema.storySummaryVersion.body,
        detail: schema.storySummaryVersion.detail,
      })
      .from(schema.storyContext)
      .innerJoin(schema.story, eq(schema.story.id, schema.storyContext.storyId))
      .innerJoin(
        schema.storySummaryVersion,
        eq(schema.storySummaryVersion.id, schema.story.currentSummaryId),
      )
      // getStory and getStoryLead only return published Stories.
      .where(isNotNull(schema.story.publishedAt))
    const link = links.find(
      (l) => !l.body.includes(l.anchorText) && l.detail?.includes(l.anchorText),
    )
    if (!link) throw new Error('no context anchored only in a detail')
    const story = await getStory(db, link.storyId)
    expect(story?.context.map((c) => c.anchorText)).toContain(link.anchorText)
    const lead = await getStoryLead(db, link.storyId)
    expect(lead?.context.map((c) => c.anchorText)).not.toContain(link.anchorText)
  })

  it('drops entries whose anchor or sources are not grounded', async () => {
    const { validContextEntries } = await import('@dn/jobs')
    const entry = {
      anchorText: 'International Criminal Court',
      title: 'International Criminal Court',
      kind: 'background' as const,
      explanation: 'A court.',
      sourceObservationIds: ['obs_1'],
    }
    const summary = 'The International Criminal Court was sanctioned.'
    expect(validContextEntries([entry], summary, new Set(['obs_1']))).toHaveLength(1)
    expect(
      validContextEntries([{ ...entry, anchorText: 'The Hague' }], summary, new Set(['obs_1'])),
    ).toHaveLength(0)
    expect(validContextEntries([entry], summary, new Set(['obs_other']))).toHaveLength(0)
    expect(validContextEntries([entry, { ...entry }], summary, new Set(['obs_1']))).toHaveLength(1)
  })

  it('keeps explanation versions append-only', async () => {
    await expect(
      h.ctx.pool.query(`update context_entry_version set explanation = 'x'`),
    ).rejects.toThrow(/append-only/)
  })
})

describe('claims', () => {
  it('extracts grounded claims for published stories', async () => {
    const { db } = h.ctx
    const claims = await db.select().from(schema.claim).where(isNull(schema.claim.supersededAt))
    expect(claims.length).toBeGreaterThan(0)
    for (const c of claims) {
      const mentions = await db
        .select({ articleId: schema.claimMention.articleId })
        .from(schema.claimMention)
        .where(eq(schema.claimMention.claimId, c.id))
      expect(mentions.length).toBeGreaterThan(0)
      for (const m of mentions) {
        const [link] = await db
          .select()
          .from(schema.storyArticle)
          .where(
            and(
              eq(schema.storyArticle.storyId, c.storyId),
              eq(schema.storyArticle.articleId, m.articleId),
            ),
          )
        expect(link).toBeDefined()
      }
    }
  })

  it('drops mentions and evidence that are not part of the story', async () => {
    const { validClaims } = await import('@dn/jobs')
    const claim = {
      proposition: 'The committee awarded the prize.',
      mentions: [
        { articleId: 'art_in', stance: 'asserts' as const },
        { articleId: 'art_out', stance: 'asserts' as const },
        { articleId: 'art_in', stance: 'quotes' as const },
      ],
      evidence: [
        { sourceReferenceId: 'src_in', relationship: 'supports' as const },
        { sourceReferenceId: 'src_out', relationship: 'supports' as const },
      ],
    }
    const [kept] = validClaims([claim], new Set(['art_in']), new Set(['src_in']))
    expect(kept?.mentions).toEqual([{ articleId: 'art_in', stance: 'asserts' }])
    expect(kept?.evidence).toEqual([{ sourceReferenceId: 'src_in', relationship: 'supports' }])
    expect(
      validClaims(
        [{ ...claim, mentions: [{ articleId: 'art_out', stance: 'asserts' }] }],
        new Set(['art_in']),
        new Set(),
      ),
    ).toEqual([])
  })

  it('supersedes earlier claims on re-extraction and links primary-source evidence', async () => {
    const { db } = h.ctx
    const { extractStoryClaims } = await import('@dn/jobs')
    const { ID_PREFIX, newId } = await import('@dn/domain')
    const [story] = await db
      .select()
      .from(schema.story)
      .where(isNotNull(schema.story.publishedAt))
      .orderBy(schema.story.id)
      .limit(1)
    if (!story?.currentSummaryId) throw new Error('no story')
    const before = await db
      .select({ id: schema.claim.id })
      .from(schema.claim)
      .where(and(eq(schema.claim.storyId, story.id), isNull(schema.claim.supersededAt)))

    // A primary document linked to this story, and a model that cites it.
    const refId = newId(ID_PREFIX.sourceReference)
    await db.insert(schema.sourceReference).values({
      id: refId,
      url: `https://www.congress.gov/claims-test/${refId}`,
      kind: 'primary_document',
      discoveredAt: new Date(),
    })
    await db
      .insert(schema.storySourceReference)
      .values({ storyId: story.id, sourceReferenceId: refId, addedAt: new Date() })
    const real = h.ctx.inference.generation.extractClaims
    h.ctx.inference.generation.extractClaims = async (input) => {
      const result = await real(input)
      return {
        ...result,
        output: {
          claims: result.output.claims.map((c) => ({
            ...c,
            evidence: [{ sourceReferenceId: refId, relationship: 'supports' as const }],
          })),
        },
      }
    }
    try {
      const result = await extractStoryClaims(h.ctx, {
        targetId: story.id,
        inputFingerprint: story.currentSummaryId,
        pipelineVersion: 'p2',
        priorityClass: 'fresh',
      })
      expect(result).toMatchObject({ status: 'ok' })
    } finally {
      h.ctx.inference.generation.extractClaims = real
    }
    const superseded = await db
      .select({ supersededAt: schema.claim.supersededAt })
      .from(schema.claim)
      .where(inArray(schema.claim.id, before.map((b) => b.id).concat('none')))
    expect(superseded.every((c) => c.supersededAt !== null)).toBe(true)

    const { getStory } = await import('@dn/server')
    const detail = await getStory(db, story.id)
    expect(detail?.claims.length).toBeGreaterThan(0)
    expect(detail?.claims[0]?.evidence[0]).toMatchObject({ relationship: 'supports' })
    expect(detail?.claims[0]?.mentions[0]?.publisher.name).toBeTruthy()
  })
})
