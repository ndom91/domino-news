// The matching decision, free of I/O: shared by the match job and the offline evaluation
// harness (match-eval.ts), so the harness scores exactly what production does.

export interface MatchPolicy {
  /** At or above: attach to the best story without asking the model. */
  autoSame: number
  /** Below: a story isn't a candidate at all. */
  llmMin: number
  /** How many candidate stories the model judges side by side, best first. */
  maxCandidates: number
}

export const STORY_ARTICLES_SHOWN = 12
const ANCHOR_ARTICLES = 4

/**
 * The articles shown for a story, oldest first. Input is oldest first. "newest": the latest 12,
 * so summaries cite what arrived last. "anchored": the first 4 (what the story is about) and the
 * newest 8, so matching doesn't drift toward a big story's latest reports.
 */
export function storyArticlesShown<T>(oldestFirst: T[], mode: 'newest' | 'anchored'): T[] {
  if (oldestFirst.length <= STORY_ARTICLES_SHOWN) return oldestFirst
  if (mode === 'newest') return oldestFirst.slice(-STORY_ARTICLES_SHOWN)
  return [
    ...oldestFirst.slice(0, ANCHOR_ARTICLES),
    ...oldestFirst.slice(-(STORY_ARTICLES_SHOWN - ANCHOR_ARTICLES)),
  ]
}

export interface Neighbour {
  articleId: string
  similarity: number
}

/** Candidate stories, best first: each story scored by its closest neighbouring article. */
export function rankStories(
  neighbours: Neighbour[],
  storyOf: (articleId: string) => string | undefined,
  minSimilarity: number,
): [storyId: string, similarity: number][] {
  const best = new Map<string, number>()
  for (const n of neighbours) {
    const storyId = storyOf(n.articleId)
    if (storyId) best.set(storyId, Math.max(best.get(storyId) ?? -Infinity, n.similarity))
  }
  return [...best.entries()].filter(([, s]) => s >= minSimilarity).sort((a, b) => b[1] - a[1])
}

export interface MatchDecision {
  storyId: string
  similarity: number
  method: 'embedding' | 'llm'
  runId?: string
}

/**
 * Attach to the top story if it's close enough; otherwise show the model the best candidates
 * side by side and attach to the one it picks. Null = start a new story.
 */
export async function decideMatch(
  ranked: [storyId: string, similarity: number][],
  policy: MatchPolicy,
  choose: (storyIds: string[]) => Promise<{ storyId: string | null; runId?: string }>,
): Promise<MatchDecision | null> {
  const [top] = ranked
  if (top && top[1] >= policy.autoSame) {
    return { storyId: top[0], similarity: top[1], method: 'embedding' }
  }
  const candidates = ranked.slice(0, policy.maxCandidates)
  if (candidates.length === 0) return null
  const { storyId, runId } = await choose(candidates.map(([id]) => id))
  const picked = candidates.find(([id]) => id === storyId)
  return picked ? { storyId: picked[0], similarity: picked[1], method: 'llm', runId } : null
}
