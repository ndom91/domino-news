import { createLogoSource } from '@dn/server'
import { describe, expect, it, vi } from 'vitest'

const API_OK = () =>
  new Response(JSON.stringify({ data: { url: 'https://dl.example/logo?sig=1', etag: 'e1' } }))
const IMAGE = () =>
  new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/webp' } })

// A stubbed fetch: logo.dev API calls return `api()`, downloads return `image()`.
function stub(api: () => Response, image: () => Response = IMAGE) {
  return vi.fn(async (input: string | URL | Request) =>
    String(input).startsWith('https://api.logo.dev/') ? api() : image(),
  )
}
const apiCalls = (fetch: ReturnType<typeof stub>) =>
  fetch.mock.calls.filter(([input]) => String(input).startsWith('https://api.logo.dev/')).length

describe('logo source', () => {
  it('fetches once through the API, then serves from memory', async () => {
    const fetch = stub(API_OK)
    const logos = createLogoSource({ apiKey: 'sk_test', fetch })
    const [a, b] = await Promise.all([logos.get('nytimes.com'), logos.get('nytimes.com')])
    const c = await logos.get('nytimes.com')
    expect(a?.contentType).toBe('image/webp')
    expect(b).toBe(a)
    expect(c).toBe(a)
    expect(apiCalls(fetch)).toBe(1)
    const [apiUrl, init] = fetch.mock.calls[0] ?? []
    expect(String(apiUrl)).toBe('https://api.logo.dev/v2/brands/logo?domain=nytimes.com')
    expect((init as RequestInit).headers).toEqual({ authorization: 'Bearer sk_test' })
    // The download asks for a small webp.
    const download = new URL(String(fetch.mock.calls[1]?.[0]))
    expect(download.searchParams.get('format')).toBe('webp')
    expect(download.searchParams.get('size')).toBe('128')
  })

  it('makes no calls without a key', async () => {
    const fetch = stub(API_OK)
    const logos = createLogoSource({ apiKey: undefined, fetch })
    expect(await logos.get('nytimes.com')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('retries a still-indexing brand only after 10 minutes', async () => {
    let t = 0
    const fetch = stub(() => new Response(null, { status: 202 }))
    const logos = createLogoSource({ apiKey: 'sk_test', fetch, now: () => t })
    expect(await logos.get('new.example')).toBeNull()
    t += 9 * 60_000
    await logos.get('new.example')
    expect(apiCalls(fetch)).toBe(1)
    t += 2 * 60_000
    await logos.get('new.example')
    expect(apiCalls(fetch)).toBe(2)
  })

  it('never stores a download that is not an image', async () => {
    const fetch = stub(
      API_OK,
      () => new Response('<html>', { headers: { 'content-type': 'text/html' } }),
    )
    const logos = createLogoSource({ apiKey: 'sk_test', fetch })
    expect(await logos.get('nytimes.com')).toBeNull()
  })

  it('stops calling logo.dev past the hourly ceiling', async () => {
    let t = 0
    const fetch = stub(() => new Response(null, { status: 404 }))
    const logos = createLogoSource({ apiKey: 'sk_test', fetch, now: () => t, hourlyLimit: 2 })
    for (const d of ['a.example', 'b.example', 'c.example', 'd.example']) await logos.get(d)
    expect(apiCalls(fetch)).toBe(2)
    t += 60 * 60_000
    await logos.get('c.example')
    expect(apiCalls(fetch)).toBe(3)
  })
})
