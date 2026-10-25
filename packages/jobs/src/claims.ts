import { schema, withTransaction } from '@dn/db'
import { ID_PREFIX, newId } from '@dn/domain'
import type { ClaimsOutput } from '@dn/schemas'
import type { AnalysisJob } from '@dn/server'
import { and, eq, isNull } from 'drizzle-orm'
import type { WorkerContext } from './context.ts'
import { type LoadedArticle, loadStoryInput } from './inputs.ts'
import { lockCurrentSummary, runStoryGeneration } from './provenance.ts'

type Claim = ClaimsOutput['claims'][number]

/**
 * Keep only grounded mentions and evidence: articles must be in this Story, evidence must
 * be one of its primary sources. Claims left without a mention are dropped.
 */
export function validClaims(
  claims: Claim[],
  articleIds: Set<string>,
  sourceReferenceIds: Set<string>,
) {
  return claims.flatMap((c) => {
    const seen = new Set<string>()
    const mentions = c.mentions.filter((m) => {
      if (!articleIds.has(m.articleId) || seen.has(m.articleId)) return false
      seen.add(m.articleId)
      return true
    })
    if (mentions.length === 0) return []
    const evidence = c.evidence.filter((e) => sourceReferenceIds.has(e.sourceReferenceId))
    return [{ ...c, mentions, evidence }]
  })
}

/** Extract claims for a Story's current summary version; earlier claims are superseded. */
export async function extractStoryClaims(ctx: WorkerContext, job: AnalysisJob) {
  const [story] = await ctx.db.select().from(schema.story).where(eq(schema.story.id, job.targetId))
  if (!story || story.currentSummaryId !== job.inputFingerprint) return { status: 'stale' }
  const input = await loadStoryInput(ctx.db, story.id)
  if (!input) return { status: 'stale' }
  const primary = await ctx.db
    .select({
      sourceReferenceId: schema.sourceReference.id,
      url: schema.sourceReference.url,
      title: schema.sourceReference.title,
    })
    .from(schema.storySourceReference)
    .innerJoin(
      schema.sourceReference,
      eq(schema.sourceReference.id, schema.storySourceReference.sourceReferenceId),
    )
    .where(eq(schema.storySourceReference.storyId, story.id))

  const { runId, result } = await runStoryGeneration(
    ctx,
    job,
    { operation: 'story_claims', storyId: story.id, inputFingerprint: job.inputFingerprint },
    () => ctx.inference.generation.extractClaims({ story: input, primarySources: primary }),
  )
  const articles = new Map((input.articles as LoadedArticle[]).map((a) => [a.articleId, a]))
  const claims = validClaims(
    result.output.claims,
    new Set(articles.keys()),
    new Set(primary.map((p) => p.sourceReferenceId)),
  )

  return withTransaction(ctx.pool, async (tx) => {
    if (!(await lockCurrentSummary(tx.db, story.id, job.inputFingerprint)))
      return { status: 'stale' }

    await tx.db
      .update(schema.claim)
      .set({ supersededAt: new Date() })
      .where(and(eq(schema.claim.storyId, story.id), isNull(schema.claim.supersededAt)))

    for (const c of claims) {
      const interpretationId = newId(ID_PREFIX.interpretation)
      await tx.db.insert(schema.interpretation).values({
        id: interpretationId,
        type: 'claim',
        subjectType: 'story',
        subjectId: story.id,
        output: c,
        analysisRunId: runId,
      })
      const mentioned = c.mentions.flatMap((m) => {
        const a = articles.get(m.articleId)
        return a ? [{ ...m, article: a }] : []
      })
      await tx.db.insert(schema.interpretationEvidence).values(
        mentioned.map((m) => ({
          interpretationId,
          observationId: m.article.observationId,
          relationship: 'derived_from' as const,
        })),
      )
      const claimId = newId(ID_PREFIX.claim)
      await tx.db.insert(schema.claim).values({
        id: claimId,
        storyId: story.id,
        proposition: c.proposition,
        interpretationId,
        summaryVersionId: job.inputFingerprint,
      })
      await tx.db.insert(schema.claimMention).values(
        mentioned.map((m) => ({
          claimId,
          articleId: m.articleId,
          articleRevisionId: m.article.revisionId,
          observationId: m.article.observationId,
          stance: m.stance,
          analysisRunId: runId,
        })),
      )
      if (c.evidence.length > 0) {
        await tx.db.insert(schema.claimEvidence).values(
          c.evidence.map((e) => ({
            claimId,
            sourceReferenceId: e.sourceReferenceId,
            relationship: e.relationship,
            analysisRunId: runId,
          })),
        )
      }
    }
    await tx.db
      .delete(schema.optionalEnrichmentCompletion)
      .where(
        and(
          eq(schema.optionalEnrichmentCompletion.storyId, story.id),
          eq(schema.optionalEnrichmentCompletion.summaryVersionId, job.inputFingerprint),
          eq(schema.optionalEnrichmentCompletion.kind, 'claims'),
        ),
      )
    await tx.db
      .insert(schema.optionalEnrichmentCompletion)
      .values({
        storyId: story.id,
        summaryVersionId: job.inputFingerprint,
        kind: 'claims',
        modelId: result.modelId,
        promptVersion: result.promptVersion,
      })
      .onConflictDoNothing()
    return {
      status: 'ok',
      claims: claims.length,
      dropped: result.output.claims.length - claims.length,
    }
  })
}
