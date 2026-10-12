// The matching decision, free of I/O: shared by the match job and the offline evaluation
// harness (match-eval.ts), so the harness scores exactly what production does.

export interface MatchPolicy {
  /** At or above: attach to the best story without asking the model. */
  autoSame: number
  /** Below: a story isn't a candidate at all. */
  llmMin: number
  /** How many candidate stories the model judges, best first. */
  maxCandidates: number
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
): [storyId: string, similarity: number][] {
  const best = new Map<string, number>()
  for (const n of neighbours) {
    const storyId = storyOf(n.articleId)
    if (storyId) best.set(storyId, Math.max(best.get(storyId) ?? 0, n.similarity))
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
 * Attach to the top story if it's close enough; otherwise ask the model about each candidate
 * in turn and attach to the first it calls the same development. Null = start a new story.
 */
export async function decideMatch(
  ranked: [storyId: string, similarity: number][],
  policy: MatchPolicy,
  judge: (storyId: string) => Promise<{ same: boolean; runId?: string } | null>,
): Promise<MatchDecision | null> {
  const [top] = ranked
  if (top && top[1] >= policy.autoSame) {
    return { storyId: top[0], similarity: top[1], method: 'embedding' }
  }
  for (const [storyId, similarity] of ranked.slice(0, policy.maxCandidates)) {
    const verdict = await judge(storyId)
    if (verdict?.same) return { storyId, similarity, method: 'llm', runId: verdict.runId }
  }
  return null
}
