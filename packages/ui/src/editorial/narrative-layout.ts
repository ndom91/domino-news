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
  row: number
  lane: number
  /** Edge that placed this node (drawn as a line); other edges are listed as text. */
  primary: {
    parentId: string
    parentRow: number
    parentLane: number
    relation: StoryRelation
  } | null
  secondary: { otherId: string; relation: StoryRelation; direction: 'outgoing' | 'incoming' }[]
}

export interface NarrativeLayout {
  rows: LaidOutNode[]
  laneCount: number
  /** Inclusive row span each lane's line covers. */
  laneSpans: { lane: number; start: number; end: number; branchFromLane: number | null }[]
}

/**
 * Git-graph-style layout: time runs down, one row per Story. A Story continues its
 * parent's lane when it is the lane's latest Story and not a branch; otherwise it opens
 * a new lane. Pure and deterministic for testing.
 */
export function layoutNarrative(nodes: NarrativeNode[], edges: NarrativeEdge[]): NarrativeLayout {
  const ordered = [...nodes].sort(
    (a, b) => a.firstObservedAt.localeCompare(b.firstObservedAt) || a.id.localeCompare(b.id),
  )
  const rowOf = new Map(ordered.map((n, i) => [n.id, i]))
  const laneOf = new Map<string, number>()
  const laneTail: string[] = []
  const spans = new Map<number, { start: number; end: number; branchFromLane: number | null }>()
  const rows: LaidOutNode[] = []

  for (const [row, node] of ordered.entries()) {
    const parents = edges
      .filter(
        (e) =>
          e.fromStoryId === node.id &&
          rowOf.has(e.toStoryId) &&
          (rowOf.get(e.toStoryId) ?? 0) < row,
      )
      .sort(
        (a, b) => PRIMARY_PREFERENCE.indexOf(a.relation) - PRIMARY_PREFERENCE.indexOf(b.relation),
      )
    const primaryEdge = parents[0]
    let lane: number
    let primary: LaidOutNode['primary'] = null
    if (primaryEdge) {
      const parentLane = laneOf.get(primaryEdge.toStoryId) ?? 0
      const parentRow = rowOf.get(primaryEdge.toStoryId) ?? 0
      const continues =
        laneTail[parentLane] === primaryEdge.toStoryId && primaryEdge.relation !== 'branches_from'
      lane = continues ? parentLane : laneTail.length
      primary = {
        parentId: primaryEdge.toStoryId,
        parentRow,
        parentLane,
        relation: primaryEdge.relation,
      }
      const span = spans.get(lane)
      if (span) span.end = row
      else
        spans.set(lane, {
          start: parentRow,
          end: row,
          branchFromLane: continues ? null : parentLane,
        })
    } else {
      lane = laneTail.length
      spans.set(lane, { start: row, end: row, branchFromLane: null })
    }
    laneOf.set(node.id, lane)
    laneTail[lane] = node.id

    const secondary = edges
      .filter((e) => e !== primaryEdge && (e.fromStoryId === node.id || e.toStoryId === node.id))
      .filter((e) => rowOf.has(e.fromStoryId) && rowOf.has(e.toStoryId))
      .map((e) => ({
        otherId: e.fromStoryId === node.id ? e.toStoryId : e.fromStoryId,
        relation: e.relation,
        direction: e.fromStoryId === node.id ? ('outgoing' as const) : ('incoming' as const),
      }))
      // Incoming edges that are another node's primary line are already visible.
      .filter((s) => s.direction === 'outgoing' || !isPrimaryOf(s.otherId, node.id, edges, rowOf))
    rows.push({ node, row, lane, primary, secondary })
  }
  return {
    rows,
    laneCount: Math.max(laneTail.length, 1),
    laneSpans: [...spans.entries()].map(([lane, s]) => ({ lane, ...s })),
  }
}

function isPrimaryOf(
  childId: string,
  parentId: string,
  edges: NarrativeEdge[],
  rowOf: Map<string, number>,
) {
  const childRow = rowOf.get(childId) ?? 0
  const candidates = edges
    .filter(
      (e) =>
        e.fromStoryId === childId &&
        rowOf.has(e.toStoryId) &&
        (rowOf.get(e.toStoryId) ?? 0) < childRow,
    )
    .sort((a, b) => PRIMARY_PREFERENCE.indexOf(a.relation) - PRIMARY_PREFERENCE.indexOf(b.relation))
  return candidates[0]?.toStoryId === parentId
}
