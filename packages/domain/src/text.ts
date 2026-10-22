const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  mdash: '—',
  ndash: '–',
  hellip: '…',
}

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X'
          ? Number.parseInt(code.slice(2), 16)
          : Number(code.slice(1))
      return Number.isFinite(n) ? String.fromCodePoint(n) : match
    }
    return ENTITY_MAP[code.toLowerCase()] ?? match
  })
}

export function stripHtml(input: string): string {
  // Decode first so entity-encoded markup (&lt;p&gt;) is stripped too.
  const decoded = decodeEntities(decodeEntities(input))
  // RSS descriptions occasionally contain a whole page's stylesheet or script. Removing only
  // tags would retain that unreadable content in article metadata and model inputs.
  return decodeEntities(
    decoded
      .replace(/<(?:script|style|template)\b[^>]*>[\s\S]*?<\/(?:script|style|template)\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function slugify(input: string, maxLength = 72): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length <= maxLength) return slug || 'untitled'
  const cut = slug.slice(0, maxLength)
  const lastDash = cut.lastIndexOf('-')
  return lastDash > 24 ? cut.slice(0, lastDash) : cut
}

const STOPWORDS = new Set(
  'a an and are as at be by for from has have he her his in is it its of on or that the their they this to was were will with after over says say said new not but who what when where why how than into about more up out its we you our us than been also amid could would should may might'.split(
    ' ',
  ),
)

export function contentTokens(input: string): string[] {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
}

export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size === 0 || sb.size === 0) return 0
  let inter = 0
  for (const t of sa) if (sb.has(t)) inter++
  return inter / (sa.size + sb.size - inter)
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input
  return `${input.slice(0, max - 1).trimEnd()}…`
}

/** "1 story", "3 stories". Pass the plural when adding "s" is wrong. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${pluralWord(count, singular, pluralForm)}`
}

/** "story" or "stories", without the count. */
export function pluralWord(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm
}
