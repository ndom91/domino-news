import type { LeanSide, PublisherLean } from '@dn/schemas'

// A Story counts as one-sided in a country when at least this many of its publishers there
// are rated, and at least this share of the rated ones sit on one side.
export const ONE_SIDED_MIN_RATED = 3
export const ONE_SIDED_SHARE = 0.75

// Below this many rated publishers a country's mix is too thin to show.
export const LEAN_MIX_MIN_RATED = 2

export function leanSide(lean: PublisherLean | null): LeanSide | null {
  if (lean === 'left' || lean === 'centre_left') return 'left'
  if (lean === 'right' || lean === 'centre_right') return 'right'
  return null
}

/** The side that dominates a country's rated coverage, or null. Centre counts as rated. */
export function oneSidedCoverage(leans: (PublisherLean | null)[]): LeanSide | null {
  const rated = leans.filter((l) => l !== null)
  if (rated.length < ONE_SIDED_MIN_RATED) return null
  for (const side of ['left', 'right'] as const) {
    const count = rated.filter((l) => leanSide(l) === side).length
    if (count / rated.length >= ONE_SIDED_SHARE) return side
  }
  return null
}

/** A plausible ISO 3166-1 alpha-2 code from a header, or null. */
export function countryFromHeader(value: string | null | undefined): string | null {
  const code = value?.trim().toUpperCase() ?? ''
  // Cloudflare sends XX for unknown and T1 for Tor.
  return /^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1' ? code : null
}

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' })

/** "United Kingdom" for "GB"; the code itself if Intl doesn't know it. */
export function countryName(code: string): string {
  try {
    return countryNames.of(code) ?? code
  } catch {
    return code
  }
}
