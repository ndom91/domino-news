// The matching decision, free of I/O: shared by the match job and the offline evaluation
// harness (match-eval.ts), so the harness scores exactly what production does.

export interface MatchPolicy {
  /** At or above: attach to the best story without asking the model. */
  autoSame: number
  /** Below: a story isn't a candidate at all. */
  llmMin: number
  /** How many candidate stories the model judges, best first. */
  maxCandidates: number
  /**
   * Which of a big story's articles the model sees. "newest": the latest 12, so a story drifts
   * toward whatever arrived last. "anchored": its first 4 (what it's about) and newest 8.
   */
  storyArticles: 'newest' | 'anchored'
  /**
   * How a candidate story is scored. "best": its single closest article. "top2": the mean of its
   * two closest (a lone article counts once), so one lucky match ranks lower.
   */
  ranking: 'best' | 'top2'
  /**
   * How the model judges candidates. "sequential": one at a time, best first, the first "same"
   * wins (so a similar but wrong story ranked first can shut out the right one). "choose": all
   * candidates side by side in one call, picking one or none.
   */
  judging: 'sequential' | 'choose'
}

export const STORY_ARTICLES_SHOWN = 12
const ANCHOR_ARTICLES = 4

/** The articles shown for a story, oldest first, chosen by `mode`. Input is oldest first. */
export function storyArticlesShown<T>(oldestFirst: T[], mode: MatchPolicy['storyArticles']): T[] {
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

/** Candidate stories, best first: each story scored by its best neighbouring article. */
export function rankStories(
  neighbours: Neighbour[],
  storyOf: (articleId: string) => string | undefined,
  minSimilarity: number,
  ranking: MatchPolicy['ranking'] = 'best',
): [storyId: string, similarity: number][] {
  const sims = new Map<string, number[]>()
  for (const n of neighbours) {
    const storyId = storyOf(n.articleId)
    if (storyId) sims.set(storyId, [...(sims.get(storyId) ?? []), n.similarity])
  }
  const score = (s: number[]) => {
    const [a = 0, b] = [...s].sort((x, y) => y - x)
    return ranking === 'top2' && b !== undefined ? (a + b) / 2 : a
  }
  return [...sims.entries()]
    .map(([id, s]): [string, number] => [id, score(s)])
    .filter(([, s]) => s >= minSimilarity)
    .sort((a, b) => b[1] - a[1])
}

export interface MatchDecision {
  storyId: string
  similarity: number
  method: 'embedding' | 'llm'
  runId?: string
}

/**
 * Attach to the top story if it's close enough; otherwise ask the model about each candidate
 * in turn and attach to the first it calls the same development. Null = start a new story.
 */
export async function decideMatch(
  ranked: [storyId: string, similarity: number][],
  policy: MatchPolicy,
  judge: (storyId: string) => Promise<{ same: boolean; runId?: string } | null>,
  choose: (storyIds: string[]) => Promise<{ storyId: string | null; runId?: string }>,
): Promise<MatchDecision | null> {
  const [top] = ranked
  if (top && top[1] >= policy.autoSame) {
    return { storyId: top[0], similarity: top[1], method: 'embedding' }
  }
  const candidates = ranked.slice(0, policy.maxCandidates)
  if (policy.judging === 'choose') {
    if (candidates.length === 0) return null
    const { storyId, runId } = await choose(candidates.map(([id]) => id))
    const picked = candidates.find(([id]) => id === storyId)
    return picked ? { storyId: picked[0], similarity: picked[1], method: 'llm', runId } : null
  }
  for (const [storyId, similarity] of candidates) {
    const verdict = await judge(storyId)
    if (verdict?.same) return { storyId, similarity, method: 'llm', runId: verdict.runId }
  }
  return null
}
