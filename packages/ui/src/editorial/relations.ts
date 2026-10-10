import type { StoryRelation } from '@dn/schemas'

// Edge convention: from = newer Story, to = older Story.
// "outgoing" = this Story is `from`; "incoming" = this Story is `to`.
const OUTGOING: Record<StoryRelation, string> = {
  follows: 'Follows',
  branches_from: 'Branches from',
  responds_to: 'Responds to',
  corrects: 'Corrects',
  provides_context_for: 'Background for',
  related_to: 'Related to',
}

const INCOMING: Record<StoryRelation, string> = {
  follows: 'Followed by',
  branches_from: 'Branched into',
  responds_to: 'Response',
  corrects: 'Corrected by',
  provides_context_for: 'Background',
  related_to: 'Related to',
}

export function relationLabel(relation: StoryRelation, direction: 'outgoing' | 'incoming') {
  return direction === 'outgoing' ? OUTGOING[relation] : INCOMING[relation]
}
