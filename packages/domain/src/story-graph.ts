import type { NarrativeEdge, NarrativeNode, StoryRelation } from '@dn/schemas'

/**
 * Edge direction convention: `from` is the newer/derived Story, `to` the established one.
 * "A follows B" => { from: A, to: B, relation: 'follows' }.
 * Temporal relations require from.firstObservedAt >= to.firstObservedAt and must stay acyclic.
 */
export const TEMPORAL_RELATIONS: ReadonlySet<StoryRelation> = new Set([
  'follows',
  'branches_from',
  'responds_to',
  'corrects',
])

export interface GraphEdge {
  fromStoryId: string
  toStoryId: string
  relation: StoryRelation
}

type EdgeValidation = { ok: true } | { ok: false; reason: string }

export function validateNewEdge(
  edge: GraphEdge,
  times: { fromFirstObservedAt: Date; toFirstObservedAt: Date },
  existing: readonly GraphEdge[],
): EdgeValidation {
  if (edge.fromStoryId === edge.toStoryId) return { ok: false, reason: 'self_edge' }
  const dup = existing.some(
    (e) =>
      (e.fromStoryId === edge.fromStoryId && e.toStoryId === edge.toStoryId) ||
      (edge.relation === 'related_to' &&
        e.relation === 'related_to' &&
        e.fromStoryId === edge.toStoryId &&
        e.toStoryId === edge.fromStoryId),
  )
  if (dup) return { ok: false, reason: 'duplicate_edge' }
  if (!TEMPORAL_RELATIONS.has(edge.relation)) return { ok: true }
  if (times.fromFirstObservedAt.getTime() < times.toFirstObservedAt.getTime()) {
    return { ok: false, reason: 'temporal_order' }
  }
  // Adding from->to creates a cycle if `from` is already reachable from `to`.
  const temporal = existing.filter((e) => TEMPORAL_RELATIONS.has(e.relation))
  const seen = new Set<string>()
  const stack = [edge.toStoryId]
  while (stack.length > 0) {
    const current = stack.pop() as string
    if (current === edge.fromStoryId) return { ok: false, reason: 'cycle' }
    if (seen.has(current)) continue
    seen.add(current)
    for (const e of temporal) if (e.fromStoryId === current) stack.push(e.toStoryId)
  }
  return { ok: true }
}

// "outgoing" = this Story is `from`; "incoming" = this Story is `to`.
const OUTGOING_LABELS: Record<StoryRelation, string> = {
  follows: 'Follows',
  branches_from: 'Branches from',
  responds_to: 'Responds to',
  corrects: 'Corrects',
  provides_context_for: 'Background for',
  related_to: 'Related to',
}

const INCOMING_LABELS: Record<StoryRelation, string> = {
  follows: 'Followed by',
  branches_from: 'Branched into',
  responds_to: 'Response',
  corrects: 'Corrected by',
  provides_context_for: 'Background',
  related_to: 'Related to',
}

/** Text only; relation types are never colour-coded. */
export function relationLabel(
  relation: StoryRelation,
  direction: 'outgoing' | 'incoming' = 'outgoing',
): string {
  return direction === 'outgoing' ? OUTGOING_LABELS[relation] : INCOMING_LABELS[relation]
}

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
