import { DESK_LABELS, DESK_SLOT, type Desk } from '@dn/schemas'

// The narrative-0…6 utilities set --dn-key / --dn-key-text for bg-key, text-key-text, border-key.
// Listed literally so Tailwind generates them.
const KEYS = [
  'narrative-0',
  'narrative-1',
  'narrative-2',
  'narrative-3',
  'narrative-4',
  'narrative-5',
  'narrative-6',
]

/** Key-colour utility for a desk; no desk yet = the neutral slot 0. */
export function deskKey(desk: Desk | null | undefined) {
  return KEYS[desk ? DESK_SLOT[desk] : 0] ?? 'narrative-0'
}

/** Key-colour utility by position (1…6, cycling): distinct colours for side-by-side items. */
export function positionKey(position: number) {
  return KEYS[1 + (position % (KEYS.length - 1))] ?? 'narrative-1'
}

/** Story-bar label: the Narrative's title, else the desk, else "Single story". */
export function deskLabel(desk: Desk | null | undefined, narrativeTitle?: string) {
  return narrativeTitle ?? (desk ? DESK_LABELS[desk] : 'Single story')
}
