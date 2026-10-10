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
  it('requires authentication', async () => {
    const res = await call('/api/v1/stories', {}, false)
    expect(res.status).toBe(401)
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('unauthorized')
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
    if (!page1.pageInfo.nextCursor) return
    const page2 = storyListResponseSchema.parse(
      await (
        await call(
          `/api/v1/stories?limit=2&cursor=${encodeURIComponent(page1.pageInfo.nextCursor)}`,
        )
      ).json(),
    )
    const ids = new Set(page1.items.map((s) => s.id))
    expect(page2.items.some((s) => ids.has(s.id))).toBe(false)
  })

  it('returns typed errors for unknown resources and bad input', async () => {
    const missing = await call('/api/v1/stories/does-not-exist')
    expect(missing.status).toBe(404)
    expect(apiErrorSchema.parse(await missing.json()).error.code).toBe('not_found')
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
