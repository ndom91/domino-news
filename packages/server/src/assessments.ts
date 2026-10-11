import { type Db, schema } from '@dn/db'
import { ID_PREFIX, newId } from '@dn/domain'
import type { AssessmentRequest, EvidenceResponse, PublisherAssessment } from '@dn/schemas'
import { desc, eq } from 'drizzle-orm'

// Bump when the rubric or evidence sources change; stored on every assessment.
export const ASSESSMENT_METHODOLOGY = 'assessment@1'

export async function publisherIdBySlug(db: Db, slug: string): Promise<string | null> {
  const [p] = await db
    .select({ id: schema.publisher.id })
    .from(schema.publisher)
    .where(eq(schema.publisher.slug, slug))
  return p?.id ?? null
}

/** The latest reviewed assessment, or null if the publisher hasn't been reviewed. */
export async function latestAssessment(
  db: Db,
  publisherId: string,
): Promise<PublisherAssessment | null> {
  const [row] = await db
    .select()
    .from(schema.publisherAssessment)
    .where(eq(schema.publisherAssessment.publisherId, publisherId))
    .orderBy(desc(schema.publisherAssessment.reviewedAt))
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    methodologyVersion: row.methodologyVersion,
    countryContext: row.countryContext,
    ownership: row.ownership,
    reliability: row.reliability,
    lean: row.lean,
    leanEvidenceUrl: row.leanEvidenceUrl,
    leanNote: row.leanNote,
    evidence: row.evidence as PublisherAssessment['evidence'],
    reviewedAt: row.reviewedAt.toISOString(),
  }
}

/** Imported, not yet reviewed evidence. Admin only. */
export async function listEvidence(db: Db, publisherId: string): Promise<EvidenceResponse> {
  const rows = await db
    .select()
    .from(schema.publisherEvidence)
    .where(eq(schema.publisherEvidence.publisherId, publisherId))
  return {
    evidence: rows.map((r) => ({
      source: r.source,
      dimension: r.dimension,
      value: r.value,
      url: r.url,
      retrievedAt: r.retrievedAt.toISOString(),
    })),
  }
}

/** Publish a review as a new assessment, freezing the evidence it was based on. */
export async function createAssessment(
  db: Db,
  input: { publisherId: string; reviewedBy: string; request: AssessmentRequest },
) {
  const { evidence } = await listEvidence(db, input.publisherId)
  const { request } = input
  await db.insert(schema.publisherAssessment).values({
    id: newId(ID_PREFIX.publisherAssessment),
    publisherId: input.publisherId,
    methodologyVersion: ASSESSMENT_METHODOLOGY,
    countryContext: request.countryContext,
    ownership: request.ownership,
    reliability: request.reliability,
    lean: request.lean,
    leanEvidenceUrl: request.lean ? request.leanEvidenceUrl : null,
    leanNote: request.leanNote,
    evidence: evidence.map(({ retrievedAt: _, ...e }) => e),
    reviewedBy: input.reviewedBy,
  })
  return latestAssessment(db, input.publisherId)
}
