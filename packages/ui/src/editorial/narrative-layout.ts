import type { NarrativeEdge, NarrativeNode, StoryRelation } from '@dn/schemas'

const PRIMARY_PREFERENCE: StoryRelation[] = [
  'follows',
  'responds_to',
  'corrects',
  'branches_from',
  'provides_context_for',
  'related_to',
]

export interface LaidOutNode {
  node: NarrativeNode
  /** The earlier Story this one most directly continues, shown above its headline. */
  primary: { parentId: string; relation: StoryRelation } | null
  /** Other links to Stories in the Narrative, listed as text. */
  secondary: { otherId: string; relation: StoryRelation; direction: 'outgoing' | 'incoming' }[]
}

/**
 * A Narrative's Stories oldest first, each with its main link to an earlier Story and its
 * other links. Rendered as one timeline. Pure for testing.
 */
export function layoutNarrative(
  nodes: NarrativeNode[],
  edges: NarrativeEdge[],
): { rows: LaidOutNode[] } {
  const ordered = [...nodes].sort(
    (a, b) => a.firstObservedAt.localeCompare(b.firstObservedAt) || a.id.localeCompare(b.id),
  )
  const rowOf = new Map(ordered.map((n, i) => [n.id, i]))
  const rows = ordered.map((node): LaidOutNode => {
    const primaryEdge = primaryEdgeOf(node.id, edges, rowOf)
    const secondary = edges
      .filter((e) => e !== primaryEdge && (e.fromStoryId === node.id || e.toStoryId === node.id))
      .filter((e) => rowOf.has(e.fromStoryId) && rowOf.has(e.toStoryId))
      .map((e) => ({
        otherId: e.fromStoryId === node.id ? e.toStoryId : e.fromStoryId,
        relation: e.relation,
        direction: e.fromStoryId === node.id ? ('outgoing' as const) : ('incoming' as const),
      }))
      // Incoming links that are the other Story's primary are already shown on that row.
      .filter(
        (s) =>
          s.direction === 'outgoing' ||
          primaryEdgeOf(s.otherId, edges, rowOf)?.toStoryId !== node.id,
      )
    return {
      node,
      primary: primaryEdge
        ? { parentId: primaryEdge.toStoryId, relation: primaryEdge.relation }
        : null,
      secondary,
    }
  })
  return { rows }
}

/** The preferred link from a Story to an earlier Story in the Narrative. */
function primaryEdgeOf(storyId: string, edges: NarrativeEdge[], rowOf: Map<string, number>) {
  const row = rowOf.get(storyId) ?? 0
  return edges
    .filter(
      (e) =>
        e.fromStoryId === storyId && rowOf.has(e.toStoryId) && (rowOf.get(e.toStoryId) ?? 0) < row,
    )
    .sort(
      (a, b) => PRIMARY_PREFERENCE.indexOf(a.relation) - PRIMARY_PREFERENCE.indexOf(b.relation),
    )[0]
}
