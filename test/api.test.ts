import { schema } from '@dn/db'
import { pickLead } from '@dn/domain'
import { publishAssessments } from '@dn/jobs'
import {
  apiErrorSchema,
  evidenceResponseSchema,
  followListSchema,
  forYouResponseSchema,
  frontPageSchema,
  insightsSchema,
  learnedSignalsSchema,
  narrativeListResponseSchema,
  opsStatusSchema,
  searchResponseSchema,
  storyDetailSchema,
  storyListResponseSchema,
  userPreferencesSchema,
} from '@dn/schemas'
import { clearCache, createUserAccount, setFeedback } from '@dn/server'
import { handleApiRequest } from '@dn/server/api'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedAndRunFixtures } from './drain.ts'
import { createTestContext, truncateAll } from './harness.ts'

// Contract tests: exercise the versioned HTTP API directly, without the React web app.
let h: Awaited<ReturnType<typeof createTestContext>>
let token = ''
const call = (path: string, init: RequestInit = {}, auth = true) =>
  handleApiRequest(
    h.ctx,
    new Request(`http://localhost:3000${path}`, {
      ...init,
      headers: {
        ...(auth ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers as Record<string, string>),
      },
    }),
  )

beforeAll(async () => {
  h = await createTestContext()
  await truncateAll(h.ctx)
  await seedAndRunFixtures(h.ctx)
  await createUserAccount(h.ctx.auth, { username: 'contract', password: 'contract-password' })
  const res = await h.ctx.auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/username', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ username: 'contract', password: 'contract-password' }),
    }),
  )
  token = res.headers.get('set-auth-token') ?? ''
  expect(token).not.toBe('')
})

afterAll(async () => {
  await h?.close()
})

describe('/api/v1 contracts', () => {
  it('requires authentication on every route', async () => {
    const routes: [string, string][] = [
      ['GET', '/api/v1/front'],
      ['GET', '/api/v1/edition'],
      ['GET', '/api/v1/stories'],
      ['GET', '/api/v1/stories/x'],
      ['POST', '/api/v1/stories/x/summary'],
      ['GET', '/api/v1/narratives'],
      ['GET', '/api/v1/narratives/x'],
      ['GET', '/api/v1/publishers'],
      ['GET', '/api/v1/search?q=x'],
      ['GET', '/api/v1/ops/status'],
      ['GET', '/api/v1/ops/failed'],
      ['POST', '/api/v1/ops/actions'],
      ['GET', '/api/v1/me/preferences'],
      ['GET', '/api/v1/me/follows'],
      ['POST', '/api/v1/me/follows'],
      ['GET', '/api/v1/for-you'],
      ['POST', '/api/v1/me/feedback'],
      ['GET', '/api/v1/me/signals'],
      ['POST', '/api/v1/me/signals'],
      ['POST', '/api/v1/me/preferences'],
      ['POST', '/api/v1/me/reads'],
      ['GET', '/api/v1/me/insights'],
    ]
    for (const [method, path] of routes) {
      const res = await call(path, { method }, false)
      expect(res.status, `${method} ${path}`).toBe(401)
      expect(apiErrorSchema.parse(await res.json()).error.code).toBe('unauthorized')
    }
  })

  it('serves logos without a session, cached publicly', async () => {
    // An unknown slug is a lasting miss. Tests run without a logo.dev key, which is a passing
    // one: it must not be cached, or adding the key later would change nothing for a day.
    const cases = [
      ['no-such-publisher', 'public, max-age=86400'],
      ['nytimes', 'no-store'],
    ]
    for (const [slug, cache] of cases) {
      const res = await call(`/api/v1/logos/${slug}.webp`, {}, false)
      expect(res.status, slug).toBe(404)
      expect(res.headers.get('cache-control'), slug).toBe(cache)
    }
  })

  it('lists stories and fetches one by slug', async () => {
    const res = await call('/api/v1/stories?limit=5')
    expect(res.status).toBe(200)
    const list = storyListResponseSchema.parse(await res.json())
    expect(list.items.length).toBeGreaterThan(0)
    const first = list.items[0]
    if (!first) throw new Error('empty list')
    const detail = storyDetailSchema.parse(
      await (await call(`/api/v1/stories/${first.slug}`)).json(),
    )
    expect(detail.id).toBe(first.id)
    expect(detail.sources.length).toBeGreaterThan(0)
    // The Story page's longer text: more than one paragraph in fixture mode.
    expect(detail.summary?.detail?.split('\n\n').length).toBeGreaterThan(1)
  })

  it('paginates with a stable cursor', async () => {
    const page1 = storyListResponseSchema.parse(
      await (await call('/api/v1/stories?limit=2')).json(),
    )
    expect(page1.pageInfo.nextCursor).toBeTruthy()
    if (!page1.pageInfo.nextCursor) return
    const page2 = storyListResponseSchema.parse(
      await (
        await call(
          `/api/v1/stories?limit=2&cursor=${encodeURIComponent(page1.pageInfo.nextCursor)}`,
        )
      ).json(),
    )
    expect(page2.items.length).toBeGreaterThan(0)
    const ids = new Set(page1.items.map((s) => s.id))
    expect(page2.items.some((s) => ids.has(s.id))).toBe(false)
  })

  it('filters stories by region, across pages', async () => {
    const all = storyListResponseSchema.parse(
      await (await call('/api/v1/stories?limit=100')).json(),
    )
    const region = all.items.flatMap((s) => s.regions)[0]
    if (!region) throw new Error('no tagged stories')
    const expected = all.items.filter((s) => s.regions.includes(region)).map((s) => s.id)

    const seen: string[] = []
    let cursor: string | null = null
    do {
      const qs = `region=${region}&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
      const page = storyListResponseSchema.parse(await (await call(`/api/v1/stories?${qs}`)).json())
      expect(page.items.every((s) => s.regions.includes(region))).toBe(true)
      seen.push(...page.items.map((s) => s.id))
      cursor = page.pageInfo.nextCursor
    } while (cursor)
    expect(seen).toEqual(expected)

    expect((await call('/api/v1/stories?region=atlantis')).status).toBe(400)
  })

  it('returns typed errors for unknown resources and bad input', async () => {
    const missing = await call('/api/v1/stories/does-not-exist')
    expect(missing.status).toBe(404)
    expect(apiErrorSchema.parse(await missing.json()).error.code).toBe('not_found')
    for (const path of ['/api/v1/stories?limit=abc', '/api/v1/stories?cursor=not-a-cursor']) {
      const res = await call(path)
      expect(res.status, path).toBe(400)
    }
    const bad = await call('/api/v1/search?q=')
    expect(bad.status).toBe(400)
    expect(apiErrorSchema.parse(await bad.json()).error.issues?.length).toBeGreaterThan(0)
  })

  it('lists only narratives with enough published stories', async () => {
    const res = await call('/api/v1/narratives')
    expect(res.status).toBe(200)
    const body = narrativeListResponseSchema.parse(await res.json())
    expect(body.items.every((n) => n.storyCount >= 4)).toBe(true)
    const { rows } = await h.ctx.pool.query(
      `select count(*)::int as n from (
         select ns.narrative_id from narrative_story ns join story s on s.id = ns.story_id
         where ns.removed_at is null and s.published_at is not null
         group by ns.narrative_id having count(*) >= 4) x`,
    )
    expect(body.items.length).toBe(rows[0].n)
  })
})

describe('/api/v1 write endpoints', () => {
  const post = (path: string, body: unknown) =>
    call(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })

  it('edits a summary as a new version and rejects stale or disabled edits', async () => {
    const list = storyListResponseSchema.parse(await (await call('/api/v1/stories?limit=1')).json())
    const story = list.items[0]
    if (!story) throw new Error('no story')
    const before = storyDetailSchema.parse(await (await call(`/api/v1/stories/${story.id}`)).json())
    const baseVersion = before.summary?.versionId ?? ''

    const ok = await post(`/api/v1/stories/${story.id}/summary`, {
      headline: 'Edited headline',
      body: 'Edited body.',
      basedOnVersionId: baseVersion,
    })
    expect(ok.status).toBe(200)
    const after = storyDetailSchema.parse(await ok.json())
    expect(after.summary).toMatchObject({ headline: 'Edited headline', origin: 'edited' })
    // Detail not sent: the previous version's carries over.
    expect(after.summary?.detail).toBe(before.summary?.detail)
    expect(after.summaryHistory.map((v) => v.versionId)).toContain(baseVersion)
    // Stale anchors are hidden and regeneration is queued for the edited text.
    const text = `Edited body.\n\n${after.summary?.detail ?? ''}`
    expect(after.context.every((c) => text.includes(c.anchorText))).toBe(true)
    const { rows } = await h.ctx.pool.query(
      `select count(*)::int as n from pgboss.job where name = 'generate_context' and data->>'inputFingerprint' = $1`,
      [after.summary?.versionId],
    )
    expect(rows[0].n).toBe(1)

    const stale = await post(`/api/v1/stories/${story.id}/summary`, {
      headline: 'Again',
      body: 'Again.',
      basedOnVersionId: baseVersion,
    })
    expect(stale.status).toBe(409)
    expect(apiErrorSchema.parse(await stale.json()).error.code).toBe('conflict')

    const withDetail = await post(`/api/v1/stories/${story.id}/summary`, {
      headline: 'Edited headline',
      body: 'Edited body.',
      detail: 'First paragraph.\n\nSecond paragraph.',
      basedOnVersionId: after.summary?.versionId,
    })
    expect(withDetail.status).toBe(200)
    const edited = storyDetailSchema.parse(await withDetail.json())
    expect(edited.summary?.detail).toBe('First paragraph.\n\nSecond paragraph.')

    h.ctx.config.enableSummaryEditing = false
    try {
      const disabled = await post(`/api/v1/stories/${story.id}/summary`, {
        headline: 'x',
        body: 'y',
        basedOnVersionId: edited.summary?.versionId ?? '',
      })
      expect(disabled.status).toBe(403)
    } finally {
      h.ctx.config.enableSummaryEditing = true
    }
  })

  it('runs pipeline actions', async () => {
    const { isBackfillPaused } = await import('@dn/server')
    expect((await post('/api/v1/ops/actions', { action: 'pause_backfill' })).status).toBe(200)
    expect(await isBackfillPaused(h.ctx)).toBe(true)
    expect((await post('/api/v1/ops/actions', { action: 'resume_backfill' })).status).toBe(200)
    expect(await isBackfillPaused(h.ctx)).toBe(false)

    const queued = async (name: string) => {
      const { rows } = await h.ctx.pool.query(
        `select count(*)::int as n from pgboss.job where name = $1 and state = 'created'`,
        [name],
      )
      return rows[0].n as number
    }
    expect((await post('/api/v1/ops/actions', { action: 'poll_all_feeds' })).status).toBe(200)
    expect(await queued('poll_all_feeds')).toBe(1)
    expect((await post('/api/v1/ops/actions', { action: 'rebuild_search' })).status).toBe(200)
    expect(await queued('rebuild_search_projection')).toBe(1)

    const bad = await post('/api/v1/ops/actions', { action: 'drop_database' })
    expect(bad.status).toBe(400)
  })

  it('retries 5 times with backoff, and updates queues created with older settings', async () => {
    const { createQueues } = await import('@dn/jobs')
    const settings = async (name: string) =>
      (
        await h.ctx.pool.query(
          `select retry_limit, retry_delay, retry_backoff, retry_delay_max from pgboss.queue where name = $1`,
          [name],
        )
      ).rows[0]
    // As an older deploy left it.
    await h.ctx.pool.query(
      `update pgboss.queue set retry_limit = 20, retry_delay = 10 where name = 'extract_claims'`,
    )
    await createQueues(await h.ctx.boss())
    expect(await settings('extract_claims')).toEqual({
      retry_limit: 5,
      retry_delay: 60,
      retry_backoff: true,
      retry_delay_max: 3600,
    })
    expect((await settings('rebuild_search_projection')).retry_limit).toBe(0)
  })

  it('lists failed jobs with their target, and retries or dismisses them', async () => {
    const { failedJobsResponseSchema } = await import('@dn/schemas')
    const boss = await h.ctx.boss()
    const { rows: stories } = await h.ctx.pool.query(
      `select id, title from story where published_at is not null limit 1`,
    )
    const story = stories[0]
    // Two jobs that fail on their only attempt, one with a Story as its target.
    const fail = async (queue: string, data: object, message: string) => {
      const id = await boss.send(queue, data, { retryLimit: 0 })
      if (!id) throw new Error('job not created')
      await h.ctx.pool.query(
        `update pgboss.job set state = 'active', started_on = now() where id = $1`,
        [id],
      )
      await boss.fail(queue, id, { message, stack: `Error: ${message}\n    at test` })
      return id
    }
    const summaryJob = await fail(
      'build_story_summary',
      { targetId: story.id, inputFingerprint: 'f1', pipelineVersion: 'p2', priorityClass: 'fresh' },
      'summary cites invalid observations: obs_x',
    )
    const claimsJob = await fail(
      'extract_claims',
      { targetId: 'sty_missing' },
      'story_claims: response is not JSON',
    )

    const list = async (query = '') =>
      failedJobsResponseSchema.parse(await (await call(`/api/v1/ops/failed${query}`)).json())
    const all = await list()
    expect(all.items.map((j) => j.id)).toEqual(expect.arrayContaining([summaryJob, claimsJob]))
    const summary = all.items.find((j) => j.id === summaryJob)
    expect(summary).toMatchObject({
      queue: 'build_story_summary',
      attempts: 1,
      maxAttempts: 1,
      error: 'summary cites invalid observations: obs_x',
      target: { type: 'story', id: story.id, title: story.title },
    })
    expect(summary?.stack).toContain('at test')
    // A target that no longer exists is just missing, not an error.
    expect(all.items.find((j) => j.id === claimsJob)?.target).toBeNull()

    const claimsOnly = await list('?queue=extract_claims')
    expect(claimsOnly.items.every((j) => j.queue === 'extract_claims')).toBe(true)

    // The page's failed counts match the list.
    const status = opsStatusSchema.parse(await (await call('/api/v1/ops/status')).json())
    expect(status.queues.find((q) => q.name === 'extract_claims')?.failed).toBe(
      claimsOnly.items.length,
    )

    const state = async (id: string) =>
      (await h.ctx.pool.query(`select state from pgboss.job where id = $1`, [id])).rows[0]?.state
    const retried = await post('/api/v1/ops/actions', {
      action: 'retry_jobs',
      queue: 'build_story_summary',
      ids: [summaryJob],
    })
    expect(await retried.json()).toMatchObject({ ok: true, count: 1 })
    expect(await state(summaryJob)).toMatch(/created|retry/)

    expect(
      (await post('/api/v1/ops/actions', { action: 'dismiss_jobs', queue: 'extract_claims' }))
        .status,
    ).toBe(200)
    expect(await state(claimsJob)).toBeUndefined()

    const unknown = await post('/api/v1/ops/actions', { action: 'retry_jobs', queue: 'nope' })
    expect(unknown.status).toBe(400)
    await boss.deleteJob('build_story_summary', summaryJob)
  })

  it('limits pipeline routes to admins', async () => {
    await createUserAccount(h.ctx.auth, {
      username: 'reader',
      password: 'reader-password',
      role: 'user',
    })
    const res = await h.ctx.auth.handler(
      new Request('http://localhost:3000/api/auth/sign-in/username', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ username: 'reader', password: 'reader-password' }),
      }),
    )
    const readerToken = res.headers.get('set-auth-token') ?? ''
    const asReader = (path: string, init: RequestInit = {}) =>
      handleApiRequest(
        h.ctx,
        new Request(`http://localhost:3000${path}`, {
          ...init,
          headers: { authorization: `Bearer ${readerToken}`, 'content-type': 'application/json' },
        }),
      )
    expect((await asReader('/api/v1/ops/status')).status).toBe(403)
    expect((await asReader('/api/v1/ops/failed')).status).toBe(403)
    expect((await asReader('/api/v1/publishers/bbc/evidence')).status).toBe(403)
    const review = await asReader('/api/v1/publishers/bbc/assessment', {
      method: 'POST',
      body: JSON.stringify({
        ownership: 'x',
        reliability: 'y',
        countryContext: null,
        lean: null,
        leanEvidenceUrl: null,
        leanNote: null,
      }),
    })
    expect(review.status).toBe(403)
    const action = await asReader('/api/v1/ops/actions', {
      method: 'POST',
      body: JSON.stringify({ action: 'pause_backfill' }),
    })
    expect(action.status).toBe(403)
    expect(apiErrorSchema.parse(await action.json()).error.code).toBe('forbidden')
    expect((await asReader('/api/v1/stories')).status).toBe(200)

    const { setUserRole } = await import('@dn/server')
    await setUserRole(h.ctx.db, 'reader', 'admin')
    expect((await asReader('/api/v1/ops/status')).status).toBe(200)
  })
})

describe('preferences', () => {
  const save = (auth: string, body: unknown) =>
    handleApiRequest(
      h.ctx,
      new Request('http://localhost:3000/api/v1/me/preferences', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
      }),
    )

  it('round-trips feed picks per user, saving only what was sent', async () => {
    const empty = userPreferencesSchema.parse(await (await call('/api/v1/me/preferences')).json())
    expect(empty).toMatchObject({ regions: [], desks: [] })

    const saved = await save(token, { regions: ['europe', 'africa'] })
    expect(saved.status).toBe(200)
    await save(token, { desks: ['science'] })
    const both = userPreferencesSchema.parse(await (await call('/api/v1/me/preferences')).json())
    expect(both).toMatchObject({ regions: ['europe', 'africa'], desks: ['science'] })

    await createUserAccount(h.ctx.auth, { username: 'other', password: 'other-password' })
    const res = await h.ctx.auth.handler(
      new Request('http://localhost:3000/api/auth/sign-in/username', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
        body: JSON.stringify({ username: 'other', password: 'other-password' }),
      }),
    )
    const otherToken = res.headers.get('set-auth-token') ?? ''
    const other = await handleApiRequest(
      h.ctx,
      new Request('http://localhost:3000/api/v1/me/preferences', {
        headers: { authorization: `Bearer ${otherToken}` },
      }),
    )
    expect(userPreferencesSchema.parse(await other.json()).regions).toEqual([])

    expect((await save(token, { regions: ['atlantis'] })).status).toBe(400)
    await save(token, { regions: [], desks: [] })
  })

  it('marks onboarding done once, and never undoes it', async () => {
    const prefs = async () =>
      userPreferencesSchema.parse(await (await call('/api/v1/me/preferences')).json())
    expect((await prefs()).onboarded).toBe(false)
    await save(token, { onboarded: true })
    expect((await prefs()).onboarded).toBe(true)
    const { rows } = await h.ctx.pool.query(
      `select onboarded_at from user_preference p join auth_user u on u.id = p.user_id where u.username = 'contract'`,
    )
    const first = rows[0].onboarded_at
    await save(token, { onboarded: false, regions: ['europe'] })
    expect(await prefs()).toMatchObject({ onboarded: true, regions: ['europe'] })
    await save(token, { onboarded: true })
    const { rows: again } = await h.ctx.pool.query(
      `select onboarded_at from user_preference p join auth_user u on u.id = p.user_id where u.username = 'contract'`,
    )
    expect(again[0].onboarded_at).toEqual(first)
    await save(token, { regions: [] })
  })
})

describe('For You', () => {
  const post = (path: string, body: unknown) =>
    call(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  const feed = async () => forYouResponseSchema.parse(await (await call('/api/v1/for-you')).json())

  it('ranks followed narratives first, explains why, and hides nothing', async () => {
    // Fixture stories are days old; bring them into the 72-hour window.
    await h.ctx.pool.query(
      `update story set last_updated_at = now() where published_at is not null`,
    )
    const before = await feed()
    expect(before.personalised).toBe(false)
    const total = before.items.length
    // The front page rail asks for a few; the API caps the page size.
    const rail = forYouResponseSchema.parse(await (await call('/api/v1/for-you?limit=2')).json())
    expect(rail.items.map((i) => i.story.id)).toEqual(
      before.items.slice(0, 2).map((i) => i.story.id),
    )
    expect((await call('/api/v1/for-you?limit=31')).status).toBe(400)

    const { rows } = await h.ctx.pool.query(
      `select ns.narrative_id, n.title from narrative_story ns join narrative n on n.id = ns.narrative_id
       join story s on s.id = ns.story_id
       where ns.removed_at is null and s.published_at is not null limit 1`,
    )
    const { narrative_id: narrativeId, title } = rows[0]
    const followed = followListSchema.parse(
      await (
        await post('/api/v1/me/follows', {
          targetType: 'narrative',
          targetId: narrativeId,
          follow: true,
        })
      ).json(),
    )
    expect(followed.items).toEqual([
      expect.objectContaining({ targetType: 'narrative', id: narrativeId, title }),
    ])

    const after = await feed()
    expect(after.personalised).toBe(true)
    expect(after.items.length).toBe(total)
    expect(after.items[0]?.reasons).toContainEqual({ kind: 'narrative', label: title })

    expect(
      (
        await post('/api/v1/me/follows', {
          targetType: 'narrative',
          targetId: 'nar_missing',
          follow: true,
        })
      ).status,
    ).toBe(404)
    await post('/api/v1/me/follows', {
      targetType: 'narrative',
      targetId: narrativeId,
      follow: false,
    })
    expect(followListSchema.parse(await (await call('/api/v1/me/follows')).json()).items).toEqual(
      [],
    )
  })
})

describe('For You feedback', () => {
  const post = (path: string, body: unknown) =>
    call(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  const feed = async () => forYouResponseSchema.parse(await (await call('/api/v1/for-you')).json())
  const signals = async () =>
    learnedSignalsSchema.parse(await (await call('/api/v1/me/signals')).json()).items

  it('learns from thumbs, hides "less" stories, undoes exactly, and never touches outlets', async () => {
    await h.ctx.pool.query(
      `update story set last_updated_at = now() where published_at is not null`,
    )
    const { rows } = await h.ctx.pool.query(
      `select id from story where published_at is not null and desk is not null limit 1`,
    )
    const storyId = rows[0].id as string
    expect(await signals()).toEqual([])

    const liked = learnedSignalsSchema.parse(
      await (await post('/api/v1/me/feedback', { storyId, signal: 'more' })).json(),
    )
    expect(liked.items.length).toBeGreaterThan(0)
    expect(liked.items.every((i) => i.weight > 0 && i.kind !== ('publisher' as string))).toBe(true)
    expect((await feed()).items.find((i) => i.story.id === storyId)?.feedback).toBe('more')

    // Switching to "less" reverses the "more" first, then pushes the other way.
    const disliked = learnedSignalsSchema.parse(
      await (await post('/api/v1/me/feedback', { storyId, signal: 'less' })).json(),
    )
    expect(disliked.items.every((i) => i.weight < 0)).toBe(true)
    expect((await feed()).items.some((i) => i.story.id === storyId)).toBe(false)

    // Undo puts everything back.
    await post('/api/v1/me/feedback', { storyId, signal: null })
    expect(await signals()).toEqual([])
    expect((await feed()).items.some((i) => i.story.id === storyId)).toBe(true)

    // Reset clears weights and taps.
    await post('/api/v1/me/feedback', { storyId, signal: 'less' })
    await post('/api/v1/me/signals', { reset: true })
    expect(await signals()).toEqual([])
    expect((await feed()).items.some((i) => i.story.id === storyId)).toBe(true)

    expect(
      (await post('/api/v1/me/feedback', { storyId: 'sty_missing', signal: 'more' })).status,
    ).toBe(404)
  })

  it('does not nudge a narrative the Story has left', async () => {
    const { rows } = await h.ctx.pool.query(
      `select ns.story_id, ns.narrative_id from narrative_story ns join story s on s.id = ns.story_id
       where ns.removed_at is null and s.published_at is not null limit 1`,
    )
    const { story_id: storyId, narrative_id: narrativeId } = rows[0]
    const membership = 'where story_id = $1 and narrative_id = $2'
    await h.ctx.pool.query(`update narrative_story set removed_at = now() ${membership}`, [
      storyId,
      narrativeId,
    ])
    await post('/api/v1/me/feedback', { storyId, signal: 'more' })
    const { rows: nudged } = await h.ctx.pool.query(
      `select 1 from user_signal where kind = 'narrative' and key = $1`,
      [narrativeId],
    )
    expect(nudged).toEqual([])

    await h.ctx.pool.query(`update narrative_story set removed_at = null ${membership}`, [
      storyId,
      narrativeId,
    ])
    await post('/api/v1/me/signals', { reset: true })
  })

  it('applies two quick taps one after the other', async () => {
    const { rows } = await h.ctx.pool.query(
      `select id from story where published_at is not null and desk is not null limit 1`,
    )
    const storyId = rows[0].id as string
    const { rows: users } = await h.ctx.pool.query(
      `select id from auth_user where username = 'contract'`,
    )
    const userId = users[0].id as string

    await Promise.all([
      setFeedback(h.ctx.db, userId, { storyId, signal: 'more' }),
      setFeedback(h.ctx.db, userId, { storyId, signal: 'less' }),
    ])
    const { rows: taps } = await h.ctx.pool.query(
      `select signal from user_story_feedback where user_id = $1 and story_id = $2`,
      [userId, storyId],
    )
    const raced = await signals()

    // Whichever tap ran second must leave exactly what that tap alone would.
    await post('/api/v1/me/signals', { reset: true })
    const alone = await setFeedback(h.ctx.db, userId, { storyId, signal: taps[0].signal })
    // Rounded: weights decay a hair between the two reads.
    const rounded = (items: typeof raced) =>
      items.map((i) => ({ ...i, weight: Math.round(i.weight * 1000) / 1000 }))
    expect(rounded(raced)).toEqual(rounded(alone.items))
    await post('/api/v1/me/signals', { reset: true })
  })
})

describe('reading history and insights', () => {
  const post = (path: string, body: unknown) =>
    call(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  const reads = async () =>
    (await h.ctx.pool.query(`select story_id from reading_event`)).rows.map((r) => r.story_id)

  it('records reads only after opting in, and forgets them when turned off', async () => {
    const { rows } = await h.ctx.pool.query(
      `select id from story where published_at is not null limit 1`,
    )
    const storyId = rows[0].id as string
    const off = insightsSchema.parse(await (await call('/api/v1/me/insights')).json())
    expect(off.enabled).toBe(false)
    expect(await (await post('/api/v1/me/reads', { storyId })).json()).toEqual({ recorded: false })
    expect(await reads()).toEqual([])

    await post('/api/v1/me/preferences', { rememberReads: true })
    expect(await (await post('/api/v1/me/reads', { storyId })).json()).toEqual({ recorded: true })
    const on = insightsSchema.parse(await (await call('/api/v1/me/insights')).json())
    expect(on).toMatchObject({ enabled: true, readCount: 1 })

    // Partial updates keep other settings; turning history off deletes it.
    const prefs = userPreferencesSchema.parse(
      await (await post('/api/v1/me/preferences', { rememberReads: false })).json(),
    )
    expect(prefs.rememberReads).toBe(false)
    expect(await reads()).toEqual([])
  })

  it('shows newer Stories in narratives you read as missed developments', async () => {
    const { rows } = await h.ctx.pool.query(
      `select ns.narrative_id, s.id, s.published_at from narrative_story ns
       join story s on s.id = ns.story_id
       where ns.removed_at is null and s.published_at is not null
         and ns.narrative_id = (
           select narrative_id from narrative_story where removed_at is null
           group by narrative_id having count(*) >= 2 limit 1)
       order by s.published_at`,
    )
    const [oldest, ...newer] = rows
    if (!oldest || newer.length === 0) throw new Error('no narrative with two stories')
    await post('/api/v1/me/preferences', { rememberReads: true })
    try {
      // Read the oldest Story just before the others were published.
      await h.ctx.pool.query(
        `insert into reading_event (user_id, story_id, read_at)
         select id, $1, $2::timestamptz - interval '1 second' from auth_user where username = 'contract'`,
        [oldest.id, newer[0].published_at],
      )
      const insights = insightsSchema.parse(await (await call('/api/v1/me/insights')).json())
      const missed = insights.missedDevelopments.find((m) => m.narrative.id === oldest.narrative_id)
      // Up to 3 of the newer Stories, never the one already read.
      const newerIds = new Set(newer.map((r) => r.id))
      expect(missed?.stories.length).toBeGreaterThan(0)
      expect(missed?.stories.every((s) => newerIds.has(s.id))).toBe(true)
    } finally {
      await post('/api/v1/me/preferences', { rememberReads: false })
    }
  })

  it('rejects reads without a story id', async () => {
    expect((await post('/api/v1/me/reads', {})).status).toBe(400)
  })
})

describe('publisher assessments', () => {
  const post = (path: string, body: unknown) =>
    call(path, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  const review = {
    fundingModel: 'public_broadcaster',
    ownership: 'Public broadcaster funded by the licence fee',
    reliabilityLevel: 'reliable',
    reliability: 'Generally reliable (Wikipedia perennial sources)',
    countryContext: 'GB',
    lean: null,
    leanEvidenceUrl: null,
    leanNote: null,
  }

  it('publishes reviewed versions that freeze the imported evidence', async () => {
    const { publisherDetailSchema } = await import('@dn/schemas')
    const detail = async () =>
      publisherDetailSchema.parse(await (await call('/api/v1/publishers/bbc')).json())
    expect((await detail()).assessment).toBeNull()

    await h.ctx.pool.query(
      `insert into publisher_evidence (id, publisher_id, source, dimension, value, url, retrieved_at)
       select 'pev_test', id, 'wp_rsp', 'reliability', 'Generally reliable', 'https://en.wikipedia.org/wiki/WP:RSP', now()
       from publisher where slug = 'bbc'`,
    )
    expect(
      evidenceResponseSchema.parse(await (await call('/api/v1/publishers/bbc/evidence')).json())
        .evidence,
    ).toHaveLength(1)

    expect((await post('/api/v1/publishers/bbc/assessment', review)).status).toBe(200)
    const first = (await detail()).assessment
    expect(first).toMatchObject({
      fundingModel: 'public_broadcaster',
      ownership: review.ownership,
      reliabilityLevel: 'reliable',
      lean: null,
    })
    // Funding models are a fixed set.
    expect(
      (await post('/api/v1/publishers/bbc/assessment', { ...review, fundingModel: 'tabloid' }))
        .status,
    ).toBe(400)
    expect(first?.evidence).toEqual([
      {
        source: 'wp_rsp',
        dimension: 'reliability',
        value: 'Generally reliable',
        url: 'https://en.wikipedia.org/wiki/WP:RSP',
      },
    ])

    // A lean must cite a source.
    expect(
      (await post('/api/v1/publishers/bbc/assessment', { ...review, lean: 'centre' })).status,
    ).toBe(400)
    const withLean = {
      ...review,
      lean: 'centre',
      leanEvidenceUrl: 'https://reutersinstitute.politics.ox.ac.uk/digital-news-report',
    }
    expect((await post('/api/v1/publishers/bbc/assessment', withLean)).status).toBe(200)
    expect((await detail()).assessment).toMatchObject({ lean: 'centre', countryContext: 'GB' })

    // History is append-only: earlier versions stay and can't be edited.
    const { rows } = await h.ctx.pool.query(
      `select count(*)::int as n from publisher_assessment a join publisher p on p.id = a.publisher_id where p.slug = 'bbc'`,
    )
    expect(rows[0].n).toBe(2)
    await expect(
      h.ctx.pool.query(`update publisher_assessment set ownership = 'edited'`),
    ).rejects.toThrow()
    expect((await call('/api/v1/publishers/nope/evidence')).status).toBe(404)
  })
})

describe('account creation', () => {
  it('leaves no half-created user when the credential step fails', async () => {
    const { createUserAccount } = await import('@dn/server')
    const ctx = await h.ctx.auth.$context
    const link = ctx.internalAdapter.linkAccount
    ctx.internalAdapter.linkAccount = async () => {
      throw new Error('link failed')
    }
    try {
      await expect(
        createUserAccount(h.ctx.auth, { username: 'halfmade', password: 'halfmade-password' }),
      ).rejects.toThrow(/link failed/)
    } finally {
      ctx.internalAdapter.linkAccount = link
    }
    const { rows } = await h.ctx.pool.query(
      `select count(*)::int as n from auth_user where username = 'halfmade'`,
    )
    expect(rows[0].n).toBe(0)
    // And creating it properly afterwards works.
    await createUserAccount(h.ctx.auth, { username: 'halfmade', password: 'halfmade-password' })
  })
})

describe('search hydration', () => {
  it('filters story hits by region and skips narratives', async () => {
    const all = storyListResponseSchema.parse(
      await (await call('/api/v1/stories?limit=100')).json(),
    )
    const region = all.items.flatMap((s) => s.regions)[0]
    if (!region) throw new Error('no tagged stories')
    const res = await call(`/api/v1/search?q=anything&region=${region}`)
    const body = searchResponseSchema.parse(await res.json())
    expect(body.hits.length).toBeGreaterThan(0)
    const tagged = new Set(all.items.filter((s) => s.regions.includes(region)).map((s) => s.id))
    expect(body.hits.every((x) => x.type === 'story' && tagged.has(x.id))).toBe(true)
  })

  it('reports narrative story counts from Postgres, not the search index', async () => {
    const narratives = h.ctx.ts.collections.get(h.ctx.ts.aliases.get('narratives') ?? 'narratives')
    const [doc] = [...(narratives?.values() ?? [])]
    if (!doc) throw new Error('no narrative indexed')
    narratives?.set(String(doc.id), { ...doc, story_count: 999 })
    const res = await call('/api/v1/search?q=anything&type=narrative')
    const body = (await res.json()) as { hits: { id: string; storyCount: number }[] }
    const hit = body.hits.find((x) => x.id === doc.id)
    const { rows } = await h.ctx.pool.query(
      `select count(*)::int as n from narrative_story ns join story s on s.id = ns.story_id
       where ns.narrative_id = $1 and ns.removed_at is null and s.published_at is not null`,
      [doc.id],
    )
    expect(hit?.storyCount).toBe(rows[0].n)
  })
})

describe('passkey endpoints', () => {
  it('require a session to manage passkeys', async () => {
    const res = await h.ctx.auth.handler(
      new Request('http://localhost:3000/api/auth/passkey/list-user-passkeys'),
    )
    expect(res.status).toBe(401)
    const authed = await h.ctx.auth.handler(
      new Request('http://localhost:3000/api/auth/passkey/list-user-passkeys', {
        headers: { authorization: `Bearer ${token}` },
      }),
    )
    expect(authed.status).toBe(200)
    expect(await authed.json()).toEqual([])
  })
})

describe('publisher coverage', () => {
  it('lists outlets with stats consistent with story membership', async () => {
    const res = await call('/api/v1/publishers')
    expect(res.status).toBe(200)
    const { publisherListResponseSchema } = await import('@dn/schemas')
    const body = publisherListResponseSchema.parse(await res.json())
    expect(body.items.length).toBe(68)
    for (const p of body.items) {
      const { rows } = await h.ctx.pool.query(
        `select count(distinct sa.story_id)::int as n from story_article sa
         join article a on a.id = sa.article_id join story s on s.id = sa.story_id
         where a.publisher_id = $1 and sa.removed_at is null and s.published_at is not null`,
        [p.id],
      )
      expect(p.storiesCovered, p.name).toBe(rows[0].n)
      expect(p.exclusives).toBeLessThanOrEqual(p.storiesCovered)
      expect(p.firstReports).toBeLessThanOrEqual(p.storiesCovered)
    }
  })

  it('keeps official sources out of first-report and only-source stats', async () => {
    const { publisherListResponseSchema } = await import('@dn/schemas')
    const list = async () =>
      publisherListResponseSchema.parse(await (await call('/api/v1/publishers')).json())
    const before = await list()
    const top = [...before.items].sort((a, b) => b.firstReports - a.firstReports)[0]
    if (!top || top.firstReports === 0) throw new Error('no first reporter')

    await h.ctx.pool.query(`update publisher set kind = 'official' where id = $1`, [top.id])
    clearCache()
    try {
      const after = await list()
      const official = after.items.find((p) => p.id === top.id)
      expect(official).toMatchObject({
        kind: 'official',
        storiesCovered: top.storiesCovered,
        firstReports: 0,
        exclusives: 0,
      })

      const [story] = await h.ctx.pool
        .query(
          `select s.slug from story s join story_article sa on sa.story_id = s.id
           join article a on a.id = sa.article_id
           where a.publisher_id = $1 and sa.removed_at is null and s.published_at is not null
           limit 1`,
          [top.id],
        )
        .then((r) => r.rows)
      const detail = storyDetailSchema.parse(
        await (await call(`/api/v1/stories/${story.slug}`)).json(),
      )
      for (const src of detail.sources) expect(src.official).toBe(src.publisher.id === top.id)
    } finally {
      await h.ctx.pool.query(`update publisher set kind = 'newsroom' where id = $1`, [top.id])
    }
  })

  it('returns a publisher with recent stories and co-coverage, or 404', async () => {
    const { publisherDetailSchema } = await import('@dn/schemas')
    const res = await call('/api/v1/publishers/bbc')
    expect(res.status).toBe(200)
    const bbc = publisherDetailSchema.parse(await res.json())
    expect(bbc.recentStories.length).toBe(bbc.storiesCovered)
    // Fixture Stories are all recent, so the 30-day profile sees every one of them.
    expect(bbc.profile.storyCount).toBe(bbc.storiesCovered)
    const deskShare = bbc.profile.desks.reduce((sum, d) => sum + d.share, 0)
    expect(deskShare).toBeLessThanOrEqual(1.0001)
    expect(bbc.coCoverage.every((c) => c.publisher.slug !== 'bbc')).toBe(true)
    expect((await call('/api/v1/publishers/nope')).status).toBe(404)
  })
})

describe('front page and citation numbers', () => {
  it('serves the front page', async () => {
    // The stats strip counts the last 24 hours; fixture articles are dated days ago, so
    // move one linked article to now to keep this independent of the wall clock.
    await h.ctx.pool.query(
      `update article set published_at = now() where id = (
         select sa.article_id from story_article sa join story s on s.id = sa.story_id
         where sa.removed_at is null and s.published_at is not null limit 1)`,
    )
    const raw = await (await call('/api/v1/front')).json()
    const front = frontPageSchema.parse(raw)
    expect(front.lead).not.toBeNull()
    // The lead shows the one-paragraph summary only; detail is for the Story page.
    expect(raw.lead.summary).not.toHaveProperty('detail')
    expect(front.stats.stories).toBeGreaterThan(0)
    expect(front.lead?.desk).not.toBeNull()

    // The lead is pickLead over the first page of Latest; Developing is the newest listed
    // Narratives, and the count matches the Narratives page.
    const latest = storyListResponseSchema.parse(await (await call('/api/v1/stories')).json())
    const prefs = userPreferencesSchema.parse(await (await call('/api/v1/me/preferences')).json())
    expect(front.lead?.id).toBe(pickLead(latest.items, prefs.regions)?.id)
    const narratives = narrativeListResponseSchema.parse(
      await (await call('/api/v1/narratives')).json(),
    )
    expect(front.narrativeCount).toBe(narratives.items.length)
    expect(front.developing.map((n) => [n.id, n.desk])).toEqual(
      narratives.items.slice(0, 3).map((n) => [n.id, n.desk]),
    )
  })

  it('accepts cited sources without a number (summaries from before citation numbers)', async () => {
    await h.ctx.db.update(schema.storySummarySource).set({ citation: null })
    const list = storyListResponseSchema.parse(await (await call('/api/v1/stories')).json())
    const cited = list.items.flatMap((s) => s.trace).filter((t) => t.citation !== null)
    expect(cited.length).toBeGreaterThan(0)
    expect(cited.every((t) => t.citation === 0)).toBe(true)
    frontPageSchema.parse(await (await call('/api/v1/front')).json())
  })
})

describe('political lean', () => {
  it('saves a reader country and rejects anything but an ISO code', async () => {
    const save = (body: unknown) =>
      call('/api/v1/me/preferences', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      })
    expect((await save({ country: 'gb' })).status).toBe(400)
    expect(userPreferencesSchema.parse(await (await save({ country: 'GB' })).json()).country).toBe(
      'GB',
    )
    expect(userPreferencesSchema.parse(await (await save({ country: null })).json()).country).toBe(
      null,
    )
  })

  it('returns the lean and country of hand-checked evidence, but freezes only its text', async () => {
    await h.ctx.pool.query(
      `insert into publisher_evidence
         (id, publisher_id, source, dimension, value, url, lean, country_context, retrieved_at)
       select 'pev_allsides', id, 'allsides', 'lean', 'AllSides rating: Lean Left',
         'https://www.allsides.com/news-source/new-york-times', 'centre_left', 'US', now()
       from publisher where slug = 'nytimes'`,
    )
    const { evidence } = evidenceResponseSchema.parse(
      await (await call('/api/v1/publishers/nytimes/evidence')).json(),
    )
    expect(evidence.find((e) => e.source === 'allsides')).toMatchObject({
      lean: 'centre_left',
      countryContext: 'US',
    })
    const published = await call('/api/v1/publishers/nytimes/assessment', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fundingModel: 'commercial',
        ownership: 'The New York Times Company',
        reliabilityLevel: null,
        reliability: 'Not rated',
        countryContext: 'US',
        lean: 'centre_left',
        leanEvidenceUrl: 'https://www.allsides.com/news-source/new-york-times',
        leanNote: null,
      }),
    })
    expect(published.status).toBe(200)
    const { rows } = await h.ctx.pool.query(
      `select evidence, methodology_version from publisher_assessment a
       join publisher p on p.id = a.publisher_id where p.slug = 'nytimes'
       order by reviewed_at desc limit 1`,
    )
    expect(rows[0].methodology_version).toBe('assessment@3')
    expect(rows[0].evidence).toEqual([
      {
        source: 'allsides',
        dimension: 'lean',
        value: 'AllSides rating: Lean Left',
        url: 'https://www.allsides.com/news-source/new-york-times',
      },
    ])
  })

  it('groups a story by country and flags one-sided coverage', async () => {
    // The published Story with the most newsrooms. Their leans are rated relative to the US,
    // which also checks that a lean's country wins over the publisher's home country.
    const { rows } = await h.ctx.pool.query<{ id: string; publisher_ids: string[] }>(`
      select s.id, array_agg(distinct p.id) as publisher_ids
      from story s
      join story_article sa on sa.story_id = s.id and sa.removed_at is null
      join article a on a.id = sa.article_id
      join publisher p on p.id = a.publisher_id and p.kind = 'newsroom' and p.country_code is not null
      where s.published_at is not null
      group by s.id order by count(distinct p.id) desc limit 1`)
    const target = rows[0]
    expect(target?.publisher_ids.length).toBeGreaterThanOrEqual(3)
    if (!target) return

    await h.ctx.pool.query(
      `insert into publisher_assessment
         (id, publisher_id, methodology_version, country_context, ownership, reliability,
          lean, lean_basis, lean_evidence_url, evidence, reviewed_by)
       select 'pas_lean_' || p.id, p.id, 'assessment@1', 'US', 'test', 'test',
         'centre_left', 'sourced', 'https://example.org/lean', '[]'::jsonb, u.id
       from publisher p, auth_user u
       where p.id = any($1) and u.username = 'contract'`,
      [target.publisher_ids],
    )
    // Fixture dates are fixed; move the Story into this week's window.
    await h.ctx.pool.query(
      `update story set published_at = now(), last_updated_at = now() where id = $1`,
      [target.id],
    )

    const story = storyDetailSchema.parse(await (await call(`/api/v1/stories/${target.id}`)).json())
    const us = story.leanMix.find((m) => m.country === 'US')
    expect(us?.publishers).toHaveLength(target.publisher_ids.length)
    expect(us?.publishers.every((p) => p.lean === 'centre_left')).toBe(true)
    expect(us?.oneSided).toBe('left')
    // Most rated country first.
    expect(story.leanMix[0]?.country).toBe('US')

    const insights = insightsSchema.parse(
      await (await call('/api/v1/me/insights', { headers: { 'cf-ipcountry': 'US' } })).json(),
    )
    expect(insights.oneSided.country).toBe('US')
    expect(insights.oneSided.stories.map((s) => s.story.id)).toContain(target.id)

    // A saved country wins over the request's.
    await call('/api/v1/me/preferences', {
      method: 'POST',
      body: JSON.stringify({ country: 'FR' }),
      headers: { 'content-type': 'application/json' },
    })
    const fr = insightsSchema.parse(
      await (await call('/api/v1/me/insights', { headers: { 'cf-ipcountry': 'US' } })).json(),
    )
    expect(fr.oneSided.country).toBe('FR')
    expect(fr.oneSided.stories.map((s) => s.story.id)).not.toContain(target.id)

    // A lean needs a basis, and a basis needs a lean.
    await expect(
      h.ctx.pool.query(
        `insert into publisher_assessment (id, publisher_id, methodology_version, ownership,
           reliability, lean, lean_evidence_url, evidence, reviewed_by)
         select 'pas_nobasis', $1, 'assessment@3', 'x', 'x', 'left', 'https://example.org', '[]', id
         from auth_user where username = 'contract'`,
        [target.publisher_ids[0]],
      ),
    ).rejects.toThrow(/lean_basis/)

    // Re-rate the same publishers as estimates: the bar still shows them, marked, but an
    // estimate can't make a Story one-sided.
    await h.ctx.pool.query(
      `insert into publisher_assessment
         (id, publisher_id, methodology_version, country_context, ownership, reliability,
          lean, lean_basis, lean_evidence_url, evidence, reviewed_by)
       select 'pas_est_' || p.id, p.id, 'assessment@3', 'US', 'test', 'test',
         'centre_left', 'estimated', 'https://example.org/lean', '[]'::jsonb, u.id
       from publisher p, auth_user u
       where p.id = any($1) and u.username = 'contract'`,
      [target.publisher_ids],
    )
    const estimated = storyDetailSchema.parse(
      await (await call(`/api/v1/stories/${target.id}`)).json(),
    )
    const usEstimated = estimated.leanMix.find((m) => m.country === 'US')
    expect(usEstimated?.publishers.every((p) => p.lean === 'centre_left' && p.estimated)).toBe(true)
    expect(usEstimated?.oneSided).toBeNull()
  })
})

describe('assessments:publish', () => {
  it('publishes the reviewed file once, then only what changed', async () => {
    const ctx = { db: h.ctx.db, config: { fixtureDir: 'fixtures' } }
    await createUserAccount(h.ctx.auth, {
      username: 'notadmin',
      password: 'notadmin-password',
      role: 'user',
    })
    await expect(publishAssessments(ctx, { username: 'notadmin', dryRun: true })).rejects.toThrow(
      /not an admin/,
    )

    const dry = await publishAssessments(ctx, { username: 'contract', dryRun: true })
    expect(dry.published).toBeGreaterThan(0)
    const { rows: before } = await h.ctx.pool.query(
      'select count(*)::int as n from publisher_assessment',
    )

    const first = await publishAssessments(ctx, { username: 'contract', dryRun: false })
    expect(first.published).toBe(dry.published)
    const { rows: after } = await h.ctx.pool.query(
      'select count(*)::int as n from publisher_assessment',
    )
    expect(after[0].n - before[0].n).toBe(first.published)

    const again = await publishAssessments(ctx, { username: 'contract', dryRun: false })
    expect(again).toMatchObject({ published: 0, unchanged: first.published + first.unchanged })
  })
})

describe('Expo app sign-in', () => {
  // Native fetch sends no Origin; @better-auth/expo/client sends the app scheme in expo-origin.
  const signIn = (expoOrigin: string) =>
    h.ctx.auth.handler(
      new Request('http://localhost:3000/api/auth/sign-in/username', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'expo-origin': expoOrigin },
        body: JSON.stringify({ username: 'contract', password: 'contract-password' }),
      }),
    )

  it('signs in from the app scheme and reaches /api/v1 with the session cookie', async () => {
    const res = await signIn('dominonews://')
    expect(res.status).toBe(200)
    // What authClient.getCookie() returns: name=value pairs, sent as a Cookie header.
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    expect(cookie).toContain('better-auth.session_token=')
    const stories = await handleApiRequest(
      h.ctx,
      new Request('http://localhost:3000/api/v1/stories', { headers: { cookie } }),
    )
    expect(stories.status).toBe(200)
  })

  it('trusts only the app scheme (better-auth skips origin checks under test, so ask it)', async () => {
    const auth = await h.ctx.auth.$context
    expect(auth.isTrustedOrigin('dominonews://')).toBe(true)
    expect(auth.isTrustedOrigin('evilapp://')).toBe(false)
    // Expo Go's exp:// URLs are trusted in development only.
    expect(auth.isTrustedOrigin('exp://192.168.1.20:8081')).toBe(false)
  })
})
