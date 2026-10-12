import { previewSchema } from '@dn/schemas'
import { handleApiRequest } from '@dn/server/api'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedAndRunFixtures } from './drain.ts'
import { createTestContext, truncateAll } from './harness.ts'

// Public routes for link previews and signed-out teasers: no session, and nothing beyond a
// title and one sentence.
let h: Awaited<ReturnType<typeof createTestContext>>
const call = (path: string) => handleApiRequest(h.ctx, new Request(`http://localhost:3000${path}`))

const published = async () => {
  const { rows } = await h.ctx.pool.query(
    `select slug from story where published_at is not null order by slug limit 1`,
  )
  if (!rows[0]) throw new Error('no published story')
  return rows[0].slug as string
}

beforeAll(async () => {
  h = await createTestContext()
  await truncateAll(h.ctx)
  await seedAndRunFixtures(h.ctx)
})

afterAll(async () => {
  await h?.close()
})

describe('previews', () => {
  it('describes a published story without a session, and only briefly', async () => {
    const slug = await published()
    const res = await call(`/api/v1/previews/story/${slug}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    const preview = previewSchema.parse(body)
    expect(preview.slug).toBe(slug)
    // One sentence, no citation markers, and none of the full story.
    expect(preview.description ?? '').not.toMatch(/\[\d+\]/)
    expect(Object.keys(body).sort()).toEqual(
      ['desk', 'description', 'kicker', 'slug', 'title', 'type', 'version'].sort(),
    )
  })

  it('hides unpublished stories and unknown slugs', async () => {
    const { rows } = await h.ctx.pool.query(
      `select slug from story where published_at is null limit 1`,
    )
    for (const slug of [rows[0]?.slug, 'no-such-story'].filter(Boolean)) {
      expect((await call(`/api/v1/previews/story/${slug}`)).status, slug).toBe(404)
      expect((await call(`/api/v1/og/story/${slug}.png`)).status, slug).toBe(404)
    }
    expect((await call('/api/v1/previews/nonsense/x')).status).toBe(404)
  })

  it('renders a cacheable share image for a story', async () => {
    const res = await call(`/api/v1/og/story/${await published()}.png?v=1`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    const bytes = new Uint8Array(await res.arrayBuffer())
    // PNG signature, then the IHDR width and height: 1200×630.
    expect([...bytes.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47])
    const view = new DataView(bytes.buffer)
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630])
  })
})
