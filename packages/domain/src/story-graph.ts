import type { StoryRelation } from '@dn/schemas'

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

export type EdgeValidation = { ok: true } | { ok: false; reason: string }

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

/** Connected components over all edge types; used to propose narrative membership. */
export function connectedComponents(nodeIds: readonly string[], edges: readonly GraphEdge[]) {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let root = x
    while (parent.get(root) !== root) root = parent.get(root) as string
    parent.set(x, root)
    return root
  }
  for (const id of nodeIds) parent.set(id, id)
  for (const e of edges) {
    if (!parent.has(e.fromStoryId)) parent.set(e.fromStoryId, e.fromStoryId)
    if (!parent.has(e.toStoryId)) parent.set(e.toStoryId, e.toStoryId)
    parent.set(find(e.fromStoryId), find(e.toStoryId))
  }
  const groups = new Map<string, string[]>()
  for (const id of parent.keys()) {
    const root = find(id)
    const list = groups.get(root) ?? []
    list.push(id)
    groups.set(root, list)
  }
  return [...groups.values()]
}
