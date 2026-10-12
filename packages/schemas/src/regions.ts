import { z } from 'zod/mini'

// Macro-regions a Story concerns. Deliberately coarse: a small enum keeps model output
// reliable and works as feed chips. Country-level tags can come later.
export const REGIONS = [
  'global',
  'north-america',
  'latin-america',
  'europe',
  'middle-east',
  'africa',
  'south-asia',
  'east-asia',
  'southeast-asia',
  'oceania',
  'central-asia',
] as const

export const regionSchema = z.enum(REGIONS)
export type Region = z.infer<typeof regionSchema>

export const REGION_LABELS: Record<Region, string> = {
  global: 'Global',
  'north-america': 'North America',
  'latin-america': 'Latin America',
  europe: 'Europe',
  'middle-east': 'Middle East',
  africa: 'Africa',
  'south-asia': 'South Asia',
  'east-asia': 'East Asia',
  'southeast-asia': 'Southeast Asia',
  oceania: 'Oceania',
  'central-asia': 'Central Asia',
}
