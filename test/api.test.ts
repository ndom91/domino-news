import {
  apiErrorSchema,
  narrativeListResponseSchema,
  storyDetailSchema,
  storyListResponseSchema,
} from '@dn/schemas'
import { createUserAccount } from '@dn/server'
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
      ['GET', '/api/v1/stories'],
      ['GET', '/api/v1/stories/x'],
      ['POST', '/api/v1/stories/x/summary'],
      ['GET', '/api/v1/narratives'],
      ['GET', '/api/v1/narratives/x'],
      ['GET', '/api/v1/publishers'],
      ['GET', '/api/v1/search?q=x'],
      ['GET', '/api/v1/ops/status'],
      ['POST', '/api/v1/ops/actions'],
    ]
    for (const [method, path] of routes) {
      const res = await call(path, { method }, false)
      expect(res.status, `${method} ${path}`).toBe(401)
      expect(apiErrorSchema.parse(await res.json()).error.code).toBe('unauthorized')
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

  it('lists narratives', async () => {
    const res = await call('/api/v1/narratives')
    expect(res.status).toBe(200)
    narrativeListResponseSchema.parse(await res.json())
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
    expect(after.summaryHistory.map((v) => v.versionId)).toContain(baseVersion)
    // Stale anchors are hidden and regeneration is queued for the edited text.
    expect(after.context.every((c) => 'Edited body.'.includes(c.anchorText))).toBe(true)
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

    h.ctx.config.enableSummaryEditing = false
    try {
      const disabled = await post(`/api/v1/stories/${story.id}/summary`, {
        headline: 'x',
        body: 'y',
        basedOnVersionId: after.summary?.versionId ?? '',
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
    expect(body.items.length).toBe(12)
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
    // Every matrix row is a multi-outlet story with exactly one-or-more first reporters.
    for (const story of body.matrix.stories) {
      expect(story.coverage.length).toBeGreaterThan(1)
      expect(story.coverage.some((c) => c.first)).toBe(true)
    }
  })

  it('returns a publisher with recent stories and co-coverage, or 404', async () => {
    const { publisherDetailSchema } = await import('@dn/schemas')
    const res = await call('/api/v1/publishers/bbc')
    expect(res.status).toBe(200)
    const bbc = publisherDetailSchema.parse(await res.json())
    expect(bbc.recentStories.length).toBe(bbc.storiesCovered)
    expect(bbc.coCoverage.every((c) => c.publisher.slug !== 'bbc')).toBe(true)
    expect((await call('/api/v1/publishers/nope')).status).toBe(404)
  })
})
