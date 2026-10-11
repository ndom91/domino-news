// Publisher logos from logo.dev, fetched through its API with the secret key and kept in
// memory. logo.dev's fair-use rules forbid proxying its CDN (img.logo.dev) from a server, but
// allow downloading through the API and serving our own copy. Browsers and Cloudflare cache
// the result for a year, so logo.dev sees about one call per publisher per server start.

export interface Logo {
  bytes: Uint8Array<ArrayBuffer>
  contentType: string
}

const API = 'https://api.logo.dev/v2/brands/logo'
const MINUTE = 60_000
const HOUR = 60 * MINUTE
// Still indexing (202) or a failed call: try again soon. No logo (404): try again tomorrow.
const RETRY_SOON = 10 * MINUTE
const RETRY_LATER = 24 * HOUR

/**
 * A logo, or why there isn't one. `none`: logo.dev has no logo for the domain, so callers may
 * cache the miss. `retry`: a passing failure (rate limit, still indexing, outage), never to be
 * cached beyond this process.
 */
export type LogoResult = { logo: Logo } | { logo: null; missing: 'none' | 'retry' }

const NONE: LogoResult = { logo: null, missing: 'none' }
const RETRY: LogoResult = { logo: null, missing: 'retry' }

interface Entry {
  result: LogoResult
  /** Hits never expire; misses are retried after this time. */
  until: number
}

export interface LogoSource {
  get(domain: string): Promise<LogoResult>
}

export function createLogoSource({
  apiKey,
  fetch = globalThis.fetch,
  now = Date.now,
  hourlyLimit = 100,
}: {
  apiKey: string | undefined
  fetch?: typeof globalThis.fetch
  now?: () => number
  /** Safety ceiling on logo.dev calls, against a restart loop or a bug. */
  hourlyLimit?: number
}): LogoSource {
  const cache = new Map<string, Entry>()
  const inFlight = new Map<string, Promise<LogoResult>>()
  // logo.dev caps open requests per account: a page of 60+ logos sent at once got 429s past
  // about 8. Four at a time stays under it.
  const MAX_OPEN = 4
  let open = 0
  const waiting: (() => void)[] = []
  async function limited<T>(task: () => Promise<T>): Promise<T> {
    if (open >= MAX_OPEN) await new Promise<void>((resolve) => waiting.push(resolve))
    open++
    try {
      return await task()
    } finally {
      open--
      waiting.shift()?.()
    }
  }
  let windowStart = 0
  let callsThisHour = 0

  // Null when the hourly ceiling is hit (not cached, so it's retried after the hour).
  async function load(domain: string): Promise<Entry | null> {
    if (now() - windowStart >= HOUR) {
      windowStart = now()
      callsThisHour = 0
    }
    if (callsThisHour >= hourlyLimit) {
      console.warn(`[logos] hourly limit of ${hourlyLimit} logo.dev calls reached`)
      return null
    }
    callsThisHour++

    const retry = { result: RETRY, until: now() + RETRY_SOON }
    try {
      const res = await fetch(`${API}?domain=${encodeURIComponent(domain)}`, {
        headers: { authorization: `Bearer ${apiKey}` },
      })
      if (res.status === 404) return { result: NONE, until: now() + RETRY_LATER }
      // 202 (still indexing), 429 (rate limited) and 5xx all pass.
      if (res.status !== 200) {
        if (res.status !== 202) console.warn(`[logos] ${domain}: logo.dev ${res.status}`)
        return retry
      }

      const body = (await res.json()) as { data?: { url?: string } }
      if (!body.data?.url) return { result: NONE, until: now() + RETRY_LATER }
      // The download URL is temporary; size and format are set on it, as in logo.dev's docs.
      const url = new URL(body.data.url)
      url.searchParams.set('format', 'webp')
      url.searchParams.set('size', '128')
      const image = await fetch(url)
      const contentType = image.headers.get('content-type') ?? ''
      if (!image.ok || !contentType.startsWith('image/')) return retry
      const bytes = new Uint8Array(await image.arrayBuffer())
      return { result: { logo: { bytes, contentType } }, until: Number.POSITIVE_INFINITY }
    } catch (error) {
      console.warn(`[logos] ${domain}:`, error)
      return retry
    }
  }

  return {
    async get(domain) {
      if (!apiKey) return RETRY
      const cached = cache.get(domain)
      if (cached && cached.until > now()) return cached.result

      // Parallel misses for one domain share a single call.
      let pending = inFlight.get(domain)
      if (!pending) {
        pending = limited(() => load(domain))
          .then((entry) => {
            if (entry) cache.set(domain, entry)
            return entry?.result ?? RETRY
          })
          .finally(() => inFlight.delete(domain))
        inFlight.set(domain, pending)
      }
      return pending
    },
  }
}
