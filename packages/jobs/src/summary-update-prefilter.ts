const COMMON_WORDS = new Set([
  'after',
  'about',
  'according',
  'against',
  'among',
  'because',
  'before',
  'could',
  'first',
  'following',
  'from',
  'have',
  'latest',
  'other',
  'reports',
  'said',
  'story',
  'that',
  'their',
  'there',
  'these',
  'they',
  'this',
  'with',
  'would',
])

// likelyCorroboration reports whether every meaningful token in the new metadata is already present.
export function likelyCorroboration(
  summary: string,
  articles: readonly { title: string; description: string | null }[],
) {
  const known = new Set(tokens(summary))
  if (known.size === 0) return false
  for (const article of articles) {
    const words = tokens(`${article.title} ${article.description ?? ''}`)
    if (words.length === 0) return false
    for (const word of words) {
      if (!known.has(word)) return false
    }
  }
  return true
}

function tokens(text: string) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const word of text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    const numeric = /\d/.test(word)
    if (!numeric && (word.length < 6 || COMMON_WORDS.has(word))) continue
    if (seen.has(word)) continue
    seen.add(word)
    out.push(word)
  }
  return out
}
