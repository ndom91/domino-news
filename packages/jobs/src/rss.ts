import { decodeEntities, normalizeArticleUrl, stripHtml } from '@dn/domain'
import { type ArticleMetadata, articleMetadataSchema } from '@dn/schemas'
import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  // Never let a feed expand entities into huge payloads.
  processEntities: false,
  isArray: (name) => ['item', 'entry', 'link'].includes(name),
})

type Node = Record<string, unknown>
const text = (v: unknown): string | null => {
  if (v == null) return null
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  if (typeof v === 'object' && '#text' in (v as Node)) return text((v as Node)['#text'])
  return null
}

const toIso = (v: unknown) => {
  const raw = text(v)
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Parse RSS 2.0, RSS 1.0 (RDF) or Atom into validated article metadata. Only titles,
 * links, dates and short descriptions are read; `content:encoded` bodies are ignored.
 * Invalid items are skipped, not fatal.
 */
export function parseFeed(xml: string): { items: ArticleMetadata[]; skipped: number } {
  const doc = parser.parse(xml) as Node
  const rss = doc.rss as Node | undefined
  const rdf = doc['rdf:RDF'] as Node | undefined
  const atom = doc.feed as Node | undefined
  const rawItems = ((rss?.channel as Node | undefined)?.item ??
    rdf?.item ??
    atom?.entry ??
    []) as Node[]

  let skipped = 0
  const items: ArticleMetadata[] = []
  for (const item of rawItems) {
    const links = (item.link ?? []) as unknown[]
    const href =
      links
        .map((l) =>
          typeof l === 'object' && l !== null ? ((l as Node)['@href'] as string) : text(l),
        )
        .find(Boolean) ?? null
    const description = text(item.description ?? item.summary)
    const guid = text(item.guid ?? item.id)
    const candidate = {
      title: stripHtml(text(item.title) ?? ''),
      description: description ? stripHtml(description) || null : null,
      canonicalUrl: href ? safeNormalize(decodeEntities(href.trim())) : '',
      publishedAt: toIso(item.pubDate ?? item['dc:date'] ?? item.published ?? item.updated),
      updatedAt: toIso(item.updated ?? item['atom:updated'] ?? item['dc:modified']),
      externalGuid: guid ? decodeEntities(guid) : null,
    }
    const parsed = articleMetadataSchema.safeParse(candidate)
    if (parsed.success) items.push(parsed.data)
    else skipped++
  }
  return { items: collapseDuplicates(items), skipped }
}

/**
 * Some feeds list one article twice (e.g. a "live" variant without a description).
 * Keep the most complete item per URL so polls don't flip-flop between variants.
 */
function collapseDuplicates(items: ArticleMetadata[]) {
  const byUrl = new Map<string, ArticleMetadata>()
  for (const item of items) {
    const existing = byUrl.get(item.canonicalUrl)
    const score = (i: ArticleMetadata) =>
      (i.description?.length ?? 0) - (/^\p{Extended_Pictographic}/u.test(i.title) ? 1 : 0)
    if (!existing || score(item) > score(existing)) byUrl.set(item.canonicalUrl, item)
  }
  return [...byUrl.values()]
}

function safeNormalize(href: string) {
  try {
    return normalizeArticleUrl(href)
  } catch {
    return ''
  }
}
