import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { publisherLeanSchema } from '@dn/schemas'
import { z } from 'zod'

// Hand-checked lean ratings (fixtures/lean-evidence.json). Neither source offers an open
// download: AllSides sends its data on request and blocks automated fetches, and the Reuters
// Institute only publishes outlet scores as charts (with the chart data behind them). So each
// entry is copied by a person, with the page it came from and the date it was checked.
//
// - AllSides (CC BY-NC 4.0, attribution required): rates outlets on the US political scale,
//   foreign ones included, so its entries are always relative to the US.
// - Reuters Institute Digital News Report: the outlet's audience left/right score in its own
//   country (-0.5 = all left, +0.5 = all right, 0 = matches the population).

const ALLSIDES_LEANS = {
  Left: 'left',
  'Lean Left': 'centre_left',
  Center: 'centre',
  'Lean Right': 'centre_right',
  Right: 'right',
} as const

const entrySchema = z.discriminatedUnion('source', [
  z.object({
    publisher: z.string(),
    source: z.literal('allsides'),
    rating: z.enum(Object.keys(ALLSIDES_LEANS) as [keyof typeof ALLSIDES_LEANS]),
    countryContext: z.literal('US'),
    url: z.url(),
    checkedAt: z.iso.date(),
  }),
  z.object({
    publisher: z.string(),
    source: z.literal('reuters_dnr'),
    // Audience score as published, e.g. -0.21.
    score: z.number().min(-0.5).max(0.5),
    // Our step for that score, chosen by the person who read it off.
    lean: publisherLeanSchema,
    countryContext: z.string().regex(/^[A-Z]{2}$/),
    // Report year, e.g. 2025.
    edition: z.number().int(),
    url: z.url(),
    checkedAt: z.iso.date(),
  }),
])
export type LeanEvidenceEntry = z.infer<typeof entrySchema>

export const leanEvidenceFileSchema = z.object({ entries: z.array(entrySchema) })

export async function loadLeanEvidence(fixtureDir: string): Promise<LeanEvidenceEntry[]> {
  const file = path.resolve(fixtureDir, 'lean-evidence.json')
  const raw = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '{"entries":[]}'
    throw error
  })
  return leanEvidenceFileSchema.parse(JSON.parse(raw)).entries
}

/** An evidence row for one hand-checked entry. The text says what scale it is on. */
export function leanEvidenceRow(e: LeanEvidenceEntry) {
  const value =
    e.source === 'allsides'
      ? `AllSides rating: ${e.rating} (US political scale; checked ${e.checkedAt})`
      : `Audience score ${e.score > 0 ? '+' : ''}${e.score.toFixed(2)} in ${e.countryContext} ` +
        `(DNR ${e.edition}; -0.5 all left, +0.5 all right; checked ${e.checkedAt})`
  return {
    source: e.source,
    dimension: 'lean' as const,
    value,
    url: e.url,
    lean: e.source === 'allsides' ? ALLSIDES_LEANS[e.rating] : e.lean,
    countryContext: e.countryContext,
  }
}
