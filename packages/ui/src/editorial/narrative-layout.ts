import type { NarrativeEdge, NarrativeNode, StoryRelation } from '@dn/schemas'

const PRIMARY_PREFERENCE: StoryRelation[] = [
  'follows',
  'responds_to',
  'corrects',
  'branches_from',
  'provides_context_for',
  'related_to',
]
const LOOSE: ReadonlySet<StoryRelation> = new Set(['related_to', 'provides_context_for'])
const MAX_LANES = 4

/** Line in one lane for half a row: none, a solid continuation, or a dashed loose link. */
export type Segment = 'solid' | 'dashed' | null

export interface LaidOutNode {
  node: NarrativeNode
  lane: number
  /** The earlier Story this one most directly continues, shown above its headline. */
  primary: { parentId: string; relation: StoryRelation } | null
  /** Other links to Stories in the Narrative, listed as text. */
  secondary: { otherId: string; relation: StoryRelation; direction: 'outgoing' | 'incoming' }[]
  /** Per lane: the line above and below the marker's height in this row. */
  top: Segment[]
  bottom: Segment[]
  /** Branches leaving this Story's marker sideways to their own lane. */
  elbows: { lane: number; segment: Exclude<Segment, null> }[]
}

/**
 * A Narrative's Stories oldest first, laid out as a git-style tree. Each Story hangs off its
 * main link to an earlier Story; the child with the most descendants continues the parent's
 * lane, others branch into the lowest lane that is free again. Pure for testing.
 */
export function layoutNarrative(
  nodes: NarrativeNode[],
  edges: NarrativeEdge[],
): { rows: LaidOutNode[]; laneCount: number } {
  const ordered = [...nodes].sort(
    (a, b) => a.firstObservedAt.localeCompare(b.firstObservedAt) || a.id.localeCompare(b.id),
  )
  const rowOf = new Map(ordered.map((n, i) => [n.id, i]))
  const parentEdge = new Map(ordered.map((n) => [n.id, primaryEdgeOf(n.id, edges, rowOf)]))

  const children = new Map(ordered.map((n) => [n.id, [] as string[]]))
  for (const [id, e] of parentEdge) if (e) children.get(e.toStoryId)?.push(id)
  const size = new Map<string, number>()
  for (const n of [...ordered].reverse()) {
    size.set(n.id, 1 + (children.get(n.id) ?? []).reduce((sum, c) => sum + (size.get(c) ?? 0), 0))
  }
  // The child that continues the parent's lane: never a branches_from (that's what a branch
  // means), a firm link over a loose one, then the bigger subtree, then the earlier Story.
  const relationOf = (id: string) => parentEdge.get(id)?.relation
  const firm = (id: string) => !LOOSE.has(relationOf(id) ?? 'related_to')
  const trunk = new Map<string, string>()
  for (const [id, kids] of children) {
    const best = kids
      .filter((k) => relationOf(k) !== 'branches_from')
      .sort(
        (a, b) =>
          Number(firm(b)) - Number(firm(a)) ||
          (size.get(b) ?? 0) - (size.get(a) ?? 0) ||
          (rowOf.get(a) ?? 0) - (rowOf.get(b) ?? 0),
      )[0]
    if (best) trunk.set(id, best)
  }

  // Last row each lane is drawn to. A lane is free for a line starting at row r if busy < r.
  const busy: number[] = []
  const laneOf = new Map<string, number>()
  const freeLane = (from: number) => {
    let lane = 0
    while ((busy[lane] ?? -1) >= from) lane++
    return Math.min(lane, MAX_LANES - 1)
  }
  for (const [row, n] of ordered.entries()) {
    const parent = parentEdge.get(n.id)?.toStoryId
    const lane =
      parent && trunk.get(parent) === n.id
        ? (laneOf.get(parent) ?? 0)
        : freeLane(parent ? (rowOf.get(parent) ?? row) : row)
    laneOf.set(n.id, lane)
    const next = trunk.get(n.id)
    busy[lane] = Math.max(busy[lane] ?? -1, next ? (rowOf.get(next) ?? row) : row)
  }
  const laneCount = Math.max(1, ...[...laneOf.values()].map((l) => l + 1))

  const top = ordered.map(() => Array<Segment>(laneCount).fill(null))
  const bottom = ordered.map(() => Array<Segment>(laneCount).fill(null))
  const elbows = ordered.map(() => [] as LaidOutNode['elbows'])
  for (const [id, e] of parentEdge) {
    if (!e) continue
    const from = rowOf.get(e.toStoryId) ?? 0
    const to = rowOf.get(id) ?? 0
    const lane = laneOf.get(id) ?? 0
    const segment = LOOSE.has(e.relation) ? 'dashed' : 'solid'
    const parentLane = laneOf.get(e.toStoryId) ?? 0
    if (lane !== parentLane) elbows[from]?.push({ lane, segment })
    for (let r = from; r <= to; r++) {
      if (r > from) setIfEmpty(top[r], lane, segment)
      if (r < to) setIfEmpty(bottom[r], lane, segment)
    }
  }

  const rows = ordered.map((node, i): LaidOutNode => {
    const primaryEdge = parentEdge.get(node.id)
    const secondary = edges
      .filter((e) => e !== primaryEdge && (e.fromStoryId === node.id || e.toStoryId === node.id))
      .filter((e) => rowOf.has(e.fromStoryId) && rowOf.has(e.toStoryId))
      .map((e) => ({
        otherId: e.fromStoryId === node.id ? e.toStoryId : e.fromStoryId,
        relation: e.relation,
        direction: e.fromStoryId === node.id ? ('outgoing' as const) : ('incoming' as const),
      }))
      // Incoming links that are the other Story's primary are already shown on that row.
      .filter((s) => s.direction === 'outgoing' || parentEdge.get(s.otherId)?.toStoryId !== node.id)
    return {
      node,
      lane: laneOf.get(node.id) ?? 0,
      primary: primaryEdge
        ? { parentId: primaryEdge.toStoryId, relation: primaryEdge.relation }
        : null,
      secondary,
      top: top[i] ?? [],
      bottom: bottom[i] ?? [],
      elbows: elbows[i] ?? [],
    }
  })
  return { rows, laneCount }
}

// Over the lane cap, two lines can share a lane; a solid line wins over a dashed one.
function setIfEmpty(segments: Segment[] | undefined, lane: number, segment: Segment) {
  if (segments && segments[lane] !== 'solid') segments[lane] = segment
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
