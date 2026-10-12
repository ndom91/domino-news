import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { type Db, schema } from '@dn/db'
import { type AssessmentRequest, assessmentRequestSchema } from '@dn/schemas'
import { createAssessment, latestAssessment } from '@dn/server'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod/mini'

// Reviewed assessments kept in the repo (fixtures/assessments.json), so every environment
// gets the same ones. Publishing goes through `createAssessment`, like the review form, so
// each one freezes the evidence imported at that moment.

export const assessmentsFileSchema = z.object({
  assessments: z.array(
    z.object({
      slug: z.string(),
      request: assessmentRequestSchema,
      sources: z._default(z.array(z.url()), []),
      notes: z._default(z.string(), ''),
    }),
  ),
})

const FIELDS = [
  'fundingModel',
  'ownership',
  'reliabilityLevel',
  'reliability',
  'countryContext',
  'lean',
  'leanBasis',
  'leanEvidenceUrl',
  'leanNote',
] as const

/** True when the latest published assessment already says exactly this. */
function unchanged(current: Record<string, unknown> | null, request: AssessmentRequest) {
  // Normalise the way createAssessment stores it: no lean means no URL and no basis, and a
  // lean without a basis is sourced.
  const wanted = {
    ...request,
    leanBasis: request.lean ? (request.leanBasis ?? 'sourced') : null,
    leanEvidenceUrl: request.lean ? request.leanEvidenceUrl : null,
  }
  return current !== null && FIELDS.every((f) => (current[f] ?? null) === (wanted[f] ?? null))
}

export async function publishAssessments(
  ctx: { db: Db; config: { fixtureDir: string } },
  opts: { username: string; dryRun: boolean },
  log: (msg: string) => void = () => {},
) {
  const { db } = ctx
  const file = path.resolve(ctx.config.fixtureDir, 'assessments.json')
  const { assessments } = assessmentsFileSchema.parse(JSON.parse(await readFile(file, 'utf8')))

  const [reviewer] = await db
    .select({ id: schema.authUser.id, role: schema.authUser.role })
    .from(schema.authUser)
    .where(eq(schema.authUser.username, opts.username.trim().toLowerCase()))
  if (!reviewer) throw new Error(`no user with username ${opts.username}`)
  if (reviewer.role !== 'admin') throw new Error(`${opts.username} is not an admin`)

  // Assessments freeze the evidence they were based on; publishing before an import would
  // freeze nothing, permanently.
  const [evidence] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.publisherEvidence)
  if (!evidence?.n) throw new Error('no imported evidence: run assessments:import first')

  const counts = { published: 0, unchanged: 0, unknown: 0 }
  for (const a of assessments) {
    const [publisher] = await db
      .select({ id: schema.publisher.id })
      .from(schema.publisher)
      .where(eq(schema.publisher.slug, a.slug))
    if (!publisher) {
      counts.unknown++
      log(`${a.slug}: no such publisher, skipped`)
      continue
    }
    const current = await latestAssessment(db, publisher.id)
    if (unchanged(current, a.request)) {
      counts.unchanged++
      continue
    }
    counts.published++
    log(`${a.slug}: ${opts.dryRun ? 'would publish' : 'published'}`)
    if (!opts.dryRun) {
      await createAssessment(db, {
        publisherId: publisher.id,
        reviewedBy: reviewer.id,
        request: a.request,
      })
    }
  }
  return { ...counts, dryRun: opts.dryRun }
}
