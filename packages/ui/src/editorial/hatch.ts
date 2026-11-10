import type { CSSProperties } from 'react'

/**
 * Hatching for "no value" or "not rated": shape, not colour, says it's empty. Set the stripe
 * colour with a text-* class.
 */
export const HATCH: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 6px)',
}
