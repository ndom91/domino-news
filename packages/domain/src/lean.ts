import type { LeanSide, PublisherLean } from '@dn/schemas'

// A Story counts as one-sided in a country when at least this many of its publishers there
// are rated, and at least this share of the rated ones sit on one side.
export const ONE_SIDED_MIN_RATED = 3
export const ONE_SIDED_SHARE = 0.75

// Below this many rated publishers a country's mix is too thin to show.
export const LEAN_MIX_MIN_RATED = 2

export type LeanBand = LeanSide | 'center'

export function leanSide(lean: PublisherLean | null): LeanSide | null {
  if (lean === 'left' || lean === 'centre_left') return 'left'
  if (lean === 'right' || lean === 'centre_right') return 'right'
  return null
}

/** Collapse the five-point publisher scale into the three bands used for coverage comparison. */
export function leanBand(lean: PublisherLean | null): LeanBand | null {
  if (lean === 'centre') return 'center'
  return leanSide(lean)
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

// Built on first use: React Native's Hermes may lack Intl.DisplayNames, and creating it at
// import time would break every importer of @dn/domain there.
let countryNames: Intl.DisplayNames | null | undefined

/** "United Kingdom" for "GB"; the code itself if Intl doesn't know it. */
export function countryName(code: string): string {
  if (countryNames === undefined) {
    countryNames =
      typeof Intl.DisplayNames === 'function'
        ? new Intl.DisplayNames(['en'], { type: 'region' })
        : null
  }
  try {
    return countryNames?.of(code) ?? code
  } catch {
    return code
  }
}

let languageNames: Intl.DisplayNames | null | undefined

/** "English" for "en"; the code itself if Intl doesn't know it. */
export function languageName(code: string): string {
  if (languageNames === undefined) {
    languageNames =
      typeof Intl.DisplayNames === 'function'
        ? new Intl.DisplayNames(['en'], { type: 'language' })
        : null
  }
  try {
    return languageNames?.of(code) ?? code
  } catch {
    return code
  }
}
