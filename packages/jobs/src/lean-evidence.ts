import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { publisherLeanSchema } from '@dn/schemas'
import { z } from 'zod/mini'

// Hand-checked lean ratings (fixtures/lean-evidence.json). Neither source offers an open
// download: AllSides sends its data on request and blocks automated fetches, and the Reuters
// Institute only publishes outlet scores as charts (with the chart data behind them). So each
// entry is copied by a person, with the page it came from and the date it was checked.
//
// - AllSides (CC BY-NC 4.0, attribution required): rates outlets on the US political scale,
//   foreign ones included, so its entries are always relative to the US.
// - Reuters Institute Digital News Report: the outlet's audience left/right score in its own
//   country (-0.5 = all left, +0.5 = all right, 0 = matches the population).
// - Domino estimate: our own documented research where no survey or rating exists, following
//   docs/prompts/lean-estimate.md. Shown to readers as an estimate, never as a measure.

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
    score: z.number().check(z.gte(-0.5), z.lte(0.5)),
    // Our step for that score, chosen by the person who read it off.
    lean: publisherLeanSchema,
    countryContext: z.string().check(z.regex(/^[A-Z]{2}$/)),
    // Report year, e.g. 2025.
    edition: z.int(),
    url: z.url(),
    checkedAt: z.iso.date(),
  }),
  z
    .object({
      publisher: z.string(),
      source: z.literal('domino_estimate'),
      // False when the country's main media divide isn't left vs right (see axisNote).
      applicable: z.boolean(),
      lean: z.nullable(publisherLeanSchema),
      countryContext: z.string().check(z.regex(/^[A-Z]{2}$/)),
      // Low-confidence estimates are not recorded at all. Null when left–right doesn't apply.
      confidence: z.nullable(z.enum(['high', 'medium'])),
      rubric: z.string().check(z.regex(/^lean-estimate@\d+$/)),
      rationale: z.string().check(z.minLength(1), z.maxLength(400)),
      axisNote: z.optional(z.string().check(z.maxLength(300))),
      sources: z.array(z.url()).check(z.minLength(1)),
      estimatedAt: z.iso.date(),
    })
    .check(
      z.refine((e) => (e.lean === null) === !e.applicable, {
        message: 'An estimate has a lean exactly when left–right applies',
      }),
      z.refine((e) => e.applicable || Boolean(e.axisNote), {
        message: 'Say which divide applies instead',
      }),
      z.refine((e) => (e.lean === null) === (e.confidence === null), {
        message: 'A lean needs a confidence, and only a lean has one',
      }),
    ),
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
  if (e.source === 'domino_estimate') {
    const value = e.applicable
      ? `Domino estimate (${e.rubric}, ${e.confidence} confidence): ${e.rationale}`
      : `Domino research (${e.rubric}): left–right lean doesn't apply. ${e.axisNote}`
    const [url = ''] = e.sources
    return {
      source: e.source,
      dimension: 'lean' as const,
      value,
      url,
      lean: e.lean,
      countryContext: e.countryContext,
    }
  }
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
