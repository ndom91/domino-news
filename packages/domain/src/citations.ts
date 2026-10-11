const MARKER = /\[(\d+(?:\s*,\s*\d+)*)\]/g

/**
 * Turn model citation markers into display numbers.
 * The model writes `[n]` (or `[n, m]`) where n is an article's 1-based position in the list
 * it was shown, which is in publishing order. Display numbers count only cited articles, in
 * the same order, so `[1]` is always the first cited outlet on the "Who reported it" board.
 * Unknown markers are dropped. Cited = explicitly listed ids plus every referenced article.
 */
export function renumberCitations(text: string, shownIds: string[], citedIds: string[]) {
  const referenced = new Set<string>()
  for (const m of text.matchAll(MARKER)) {
    for (const n of (m[1] ?? '').split(',')) {
      const id = shownIds[Number(n.trim()) - 1]
      if (id) referenced.add(id)
    }
  }
  const cited = new Set([...citedIds, ...referenced])
  const ordered = [
    ...shownIds.filter((id) => cited.has(id)),
    ...[...cited].filter((id) => !shownIds.includes(id)),
  ]
  const citation = new Map(ordered.map((id, i) => [id, i + 1]))
  const body = text
    .replace(MARKER, (_, group: string) =>
      group
        .split(',')
        .map((n) => shownIds[Number(n.trim()) - 1])
        .flatMap((id) => (id && citation.has(id) ? [`[${citation.get(id)}]`] : []))
        .join(''),
    )
    .replace(/\s+([.,;:])/g, '$1')
  return { body, citation }
}

/** Remove `[n]` / `[n, m]` citation markers, for plain-text previews. */
export function stripCitations(text: string) {
  return text.replace(MARKER, '')
}

export type SummaryPart = { text: string } | { citation: number }

/** Split a stored summary into text and `[n]` citation markers for rendering. */
export function splitCitations(text: string): SummaryPart[] {
  const parts: SummaryPart[] = []
  let cursor = 0
  for (const m of text.matchAll(/\[(\d+)\]/g)) {
    const at = m.index ?? 0
    if (at > cursor) parts.push({ text: text.slice(cursor, at) })
    parts.push({ citation: Number(m[1]) })
    cursor = at + m[0].length
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) })
  return parts
}
