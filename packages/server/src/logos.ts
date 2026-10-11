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

interface Entry {
  logo: Logo | null
  /** Hits never expire; misses are retried after this time. */
  until: number
}

export interface LogoSource {
  /** The logo for a publisher domain, or null when there isn't one (yet). */
  get(domain: string): Promise<Logo | null>
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
  const inFlight = new Map<string, Promise<Logo | null>>()
  let windowStart = 0
  let callsThisHour = 0

  // Returns the logo and how long to keep a miss, or null when the ceiling is hit (not cached).
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

    try {
      const res = await fetch(`${API}?domain=${encodeURIComponent(domain)}`, {
        headers: { authorization: `Bearer ${apiKey}` },
      })
      if (res.status === 202) return { logo: null, until: now() + RETRY_SOON }
      if (res.status === 404) return { logo: null, until: now() + RETRY_LATER }
      if (!res.ok) return { logo: null, until: now() + RETRY_SOON }

      const body = (await res.json()) as { data?: { url?: string } }
      if (!body.data?.url) return { logo: null, until: now() + RETRY_LATER }
      // The download URL is temporary; size and format are set on it, as in logo.dev's docs.
      const url = new URL(body.data.url)
      url.searchParams.set('format', 'webp')
      url.searchParams.set('size', '128')
      const image = await fetch(url)
      const contentType = image.headers.get('content-type') ?? ''
      if (!image.ok || !contentType.startsWith('image/'))
        return { logo: null, until: now() + RETRY_SOON }
      const bytes = new Uint8Array(await image.arrayBuffer())
      return { logo: { bytes, contentType }, until: Number.POSITIVE_INFINITY }
    } catch (error) {
      console.warn(`[logos] ${domain}:`, error)
      return { logo: null, until: now() + RETRY_SOON }
    }
  }

  return {
    async get(domain) {
      if (!apiKey) return null
      const cached = cache.get(domain)
      if (cached && cached.until > now()) return cached.logo

      // Parallel misses for one domain share a single call.
      let pending = inFlight.get(domain)
      if (!pending) {
        pending = load(domain)
          .then((entry) => {
            if (entry) cache.set(domain, entry)
            return entry?.logo ?? null
          })
          .finally(() => inFlight.delete(domain))
        inFlight.set(domain, pending)
      }
      return pending
    },
  }
}
