import { type Db, schema } from '@dn/db'
import { ID_PREFIX, newId } from '@dn/domain'
import type {
  AssessmentRequest,
  EvidenceResponse,
  PublisherAssessment,
  PublisherLean,
} from '@dn/schemas'
import { desc, eq, inArray } from 'drizzle-orm'

// Bump when the rubric or evidence sources change; stored on every assessment.
// @2: hand-checked lean evidence (AllSides, Reuters Institute DNR) joined the sources.
export const ASSESSMENT_METHODOLOGY = 'assessment@2'

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
    fundingModel: row.fundingModel,
    ownership: row.ownership,
    reliabilityLevel: row.reliabilityLevel,
    reliability: row.reliability,
    lean: row.lean,
    leanEvidenceUrl: row.leanEvidenceUrl,
    leanNote: row.leanNote,
    evidence: row.evidence as PublisherAssessment['evidence'],
    reviewedAt: row.reviewedAt.toISOString(),
  }
}

export interface PublisherLeanInfo {
  lean: PublisherLean | null
  // The country the lean is relative to; falls back to the publisher's home country.
  country: string | null
}

/** Lean and its country from each publisher's latest assessment, for many publishers. */
export async function latestLeans(
  db: Db,
  publisherIds: string[],
): Promise<Map<string, PublisherLeanInfo>> {
  if (publisherIds.length === 0) return new Map()
  const rows = await db
    .selectDistinctOn([schema.publisher.id], {
      publisherId: schema.publisher.id,
      homeCountry: schema.publisher.countryCode,
      lean: schema.publisherAssessment.lean,
      countryContext: schema.publisherAssessment.countryContext,
    })
    .from(schema.publisher)
    .leftJoin(
      schema.publisherAssessment,
      eq(schema.publisherAssessment.publisherId, schema.publisher.id),
    )
    .where(inArray(schema.publisher.id, publisherIds))
    .orderBy(schema.publisher.id, desc(schema.publisherAssessment.reviewedAt))
  return new Map(
    rows.map((r) => [
      r.publisherId,
      { lean: r.lean ?? null, country: r.countryContext ?? r.homeCountry ?? null },
    ]),
  )
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
      lean: r.lean,
      countryContext: r.countryContext,
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
    fundingModel: request.fundingModel,
    ownership: request.ownership,
    reliabilityLevel: request.reliabilityLevel,
    reliability: request.reliability,
    lean: request.lean,
    leanEvidenceUrl: request.lean ? request.leanEvidenceUrl : null,
    leanNote: request.leanNote,
    evidence: evidence.map(({ source, dimension, value, url }) => ({
      source,
      dimension,
      value,
      url,
    })),
    reviewedBy: input.reviewedBy,
  })
  return latestAssessment(db, input.publisherId)
}
