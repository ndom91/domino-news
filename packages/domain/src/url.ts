const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'cmpid',
  'cmp',
  'ocid',
  'ito',
  'smid',
  'smtyp',
  'ref',
  'referer',
  'rss',
  'partner',
  'traffic_source',
  'at_medium',
  'at_campaign',
  'xtor',
  'maca',
  'mc_cid',
  'mc_eid',
])

/**
 * Canonical form used for article deduplication.
 * Rules: https, lowercase host without "www.", no fragment, tracking params removed,
 * remaining params sorted, no trailing slash (except root), no default ports.
 */
export function normalizeArticleUrl(input: string): string {
  const url = new URL(input.trim())
  url.protocol = 'https:'
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, '')
  url.hash = ''
  url.port = ''
  const kept = [...url.searchParams.entries()]
    .filter(([key]) => {
      const k = key.toLowerCase()
      return !k.startsWith('utm_') && !TRACKING_PARAMS.has(k)
    })
    .sort(([a], [b]) => a.localeCompare(b))
  url.search = ''
  for (const [k, v] of kept) url.searchParams.append(k, v)
  let out = url.toString()
  if (url.pathname !== '/' && out.endsWith('/') && !url.search) out = out.slice(0, -1)
  return out
}

export function hostnameOf(input: string): string | null {
  try {
    return new URL(input).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
}

// Bump to bypass logos (and 404s) already cached by browsers and Cloudflare.
const LOGO_VERSION = 2

/** Our cached copy of a publisher's logo (served by the API, 404 when there is none). */
export function logoUrl(slug: string): string {
  return `/api/v1/logos/${encodeURIComponent(slug)}.webp?v=${LOGO_VERSION}`
}
