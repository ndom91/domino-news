import type { Region } from '@dn/schemas'

// ISO 3166-1 alpha-2 → macro-region, for publishers' home countries. Used by fixture
// inference as a stand-in; real models tag the regions a Story is about instead.
const COUNTRY_REGION: Record<string, Region> = {
  US: 'north-america',
  CA: 'north-america',
  MX: 'latin-america',
  BR: 'latin-america',
  AR: 'latin-america',
  CL: 'latin-america',
  CO: 'latin-america',
  PE: 'latin-america',
  GB: 'europe',
  IE: 'europe',
  FR: 'europe',
  DE: 'europe',
  NL: 'europe',
  BE: 'europe',
  ES: 'europe',
  PT: 'europe',
  IT: 'europe',
  CH: 'europe',
  AT: 'europe',
  PL: 'europe',
  UA: 'europe',
  LV: 'europe',
  LT: 'europe',
  EE: 'europe',
  CZ: 'europe',
  HU: 'europe',
  RO: 'europe',
  GR: 'europe',
  RS: 'europe',
  BA: 'europe',
  SE: 'europe',
  NO: 'europe',
  DK: 'europe',
  FI: 'europe',
  QA: 'middle-east',
  AE: 'middle-east',
  SA: 'middle-east',
  IL: 'middle-east',
  TR: 'middle-east',
  LB: 'middle-east',
  ZA: 'africa',
  NG: 'africa',
  KE: 'africa',
  GH: 'africa',
  EG: 'africa',
  IN: 'south-asia',
  PK: 'south-asia',
  BD: 'south-asia',
  LK: 'south-asia',
  NP: 'south-asia',
  CN: 'east-asia',
  HK: 'east-asia',
  TW: 'east-asia',
  JP: 'east-asia',
  KR: 'east-asia',
  PH: 'southeast-asia',
  ID: 'southeast-asia',
  SG: 'southeast-asia',
  MY: 'southeast-asia',
  TH: 'southeast-asia',
  VN: 'southeast-asia',
  AU: 'oceania',
  NZ: 'oceania',
  KZ: 'central-asia',
  UZ: 'central-asia',
}

export function regionForCountry(countryCode: string | null | undefined): Region | null {
  return countryCode ? (COUNTRY_REGION[countryCode.toUpperCase()] ?? null) : null
}

type LeadCandidate = { lastUpdatedAt: string; sourceCount: number; regions: readonly string[] }

/**
 * Lead = the most widely reported Story updated in the last 48 hours (else the newest).
 * With the reader's regions, a recent Story tagged with one of them wins over the rest.
 */
export function pickLead<T extends LeadCandidate>(
  stories: T[],
  regions: readonly Region[] = [],
  now = Date.now(),
): T | undefined {
  const cutoff = now - 48 * 3_600_000
  const recent = stories.filter((s) => new Date(s.lastUpdatedAt).getTime() >= cutoff)
  const inRegions = recent.filter((s) => s.regions.some((r) => regions.includes(r as Region)))
  const pool = inRegions.length > 0 ? inRegions : recent.length > 0 ? recent : stories
  return pool.reduce<T | undefined>(
    (best, s) => (!best || s.sourceCount > best.sourceCount ? s : best),
    undefined,
  )
}
