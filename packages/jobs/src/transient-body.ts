import { stripHtml } from '@dn/domain'

const MAX_HTML_BYTES = 2_000_000
const MAX_BODY_CHARS = 6000

// Domains/paths that usually indicate primary documents rather than reporting.
const PRIMARY_PATTERNS = [
  /\.gov(\.[a-z]{2})?\//,
  /\.gouv\.fr\//,
  /europa\.eu\//,
  /\.int\//,
  /un\.org\//,
  /doi\.org\//,
  /arxiv\.org\//,
  /\.pdf($|\?)/,
  /courtlistener\.com\//,
  /supremecourt\.gov\//,
  /legislation\.gov\.uk\//,
]

export interface TransientArticle {
  /** Plain-text body. Keep in memory only; never persist, enqueue or log it. */
  body: string
  primaryLinks: string[]
}

/**
 * Fetch an article page for one-off analysis. Only call for publishers whose policy is
 * `transient_body_allowed`. Errors are reported without any page content.
 */
export async function fetchTransientArticle(url: string): Promise<TransientArticle | null> {
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'DominoNewsPrototype/0.1 (+metadata analysis)' },
      signal: AbortSignal.timeout(15_000),
      redirect: 'follow',
    })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null
    const html = (await res.text()).slice(0, MAX_HTML_BYTES)
    const article = html.match(/<article[\s\S]*?<\/article>/i)?.[0] ?? html
    const paragraphs = [...article.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) =>
      stripHtml(m[1] ?? ''),
    )
    const body = paragraphs
      .filter((p) => p.length > 40)
      .join('\n')
      .slice(0, MAX_BODY_CHARS)
    const primaryLinks = [...article.matchAll(/href="(https?:\/\/[^"]+)"/gi)]
      .map((m) => m[1] ?? '')
      .filter((href) => PRIMARY_PATTERNS.some((p) => p.test(href)))
    return { body, primaryLinks: [...new Set(primaryLinks)].slice(0, 10) }
  } catch {
    return null
  }
}
