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

export function narrativeKey(slot: number | null | undefined) {
  return KEYS[slot ?? 0] ?? KEYS[0]
}
