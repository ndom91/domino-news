import { type Db, schema, withTransaction } from '@dn/db'
import {
  type GraphEdge,
  ID_PREFIX,
  newId,
  slugify,
  TEMPORAL_RELATIONS,
  validateNewEdge,
} from '@dn/domain'
import { PROMPT_VERSIONS, type StoryInput } from '@dn/inference'
import { relationshipCandidateSchema, type StoryRelation } from '@dn/schemas'
import {
  type AnalysisJob,
  nearestByVector,
  recordStoryUpdate,
  touchNarrative,
  touchStory,
} from '@dn/server'
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import type { WorkerContext } from './context.ts'
import { loadStoryInput } from './inputs.ts'
import { THRESHOLDS } from './match.ts'
import { runStoryGeneration, withAnalysisRun } from './provenance.ts'

const MAX_CANDIDATES = 4
const MAX_NARRATIVE_COMPONENT = 40
class RelationshipInputsChangedError extends Error {}

/**
 * After a Story has a summary: embed it, look for related published Stories, ask the
 * model how they relate, add valid typed edges, then update narrative membership.
 */
export async function relateStory(ctx: WorkerContext, job: AnalysisJob) {
  const [story] = await ctx.db.select().from(schema.story).where(eq(schema.story.id, job.targetId))
  if (
    !story?.publishedAt ||
    story.currentSummaryId !== job.inputFingerprint ||
    !story.inputFingerprint
  )
    return { status: 'stale' }
  const input = await loadStoryInput(ctx.db, story.id)
  if (!input) return { status: 'stale' }

  let vector = story.embedding
  if (
    !vector ||
    story.embeddingModelId !== ctx.inference.embeddings.modelId ||
    story.embeddingSummaryId !== story.currentSummaryId
  ) {
    const [generated] = await ctx.gpu.embeddings.run(job.priorityClass, () =>
      ctx.inference.embeddings.embedDocuments([{ title: input.title, text: input.summary ?? '' }]),
    )
    if (!generated) throw new Error('empty story embedding')
    vector = generated
    const current = await withTransaction(ctx.pool, async (tx) => {
      const updated = await tx.db
        .update(schema.story)
        .set({
          embedding: vector,
          embeddingModelId: ctx.inference.embeddings.modelId,
          embeddingSummaryId: story.currentSummaryId,
        })
        .where(
          and(
            eq(schema.story.id, story.id),
            eq(schema.story.currentSummaryId, job.inputFingerprint),
          ),
        )
        .returning({ id: schema.story.id })
      if (updated.length === 0) return false
      await touchStory(tx.db, story.id, 'story.embedded', null)
      return true
    })
    if (!current) return { status: 'stale' }
  }

  const { relateMin } = THRESHOLDS[ctx.inference.mode]
  const candidates = (
    await nearestByVector(ctx.ts, 'stories', vector, { k: 10, filter: `id:!=${story.id}` })
  )
    .filter((c) => c.similarity >= relateMin)
    .slice(0, MAX_CANDIDATES)

  let added = 0
  for (const candidate of candidates) {
    if (
      await createEdgeIfRelated(
        ctx,
        job,
        input,
        story.firstObservedAt,
        story.inputFingerprint,
        candidate.id,
        candidate.similarity,
      )
    ) {
      added++
    }
  }
  await assignNarrative(ctx, job, story.id, story.inputFingerprint)
  return { status: 'ok', candidates: candidates.length, added }
}

async function createEdgeIfRelated(
  ctx: WorkerContext,
  job: AnalysisJob,
  self: StoryInput,
  selfFirstObservedAt: Date,
  selfInputFingerprint: string,
  otherId: string,
  similarity: number,
) {
  const existing = await edgesForValidation(ctx.db, self.storyId, otherId)
  const linked = existing.some(
    (e) =>
      (e.fromStoryId === self.storyId && e.toStoryId === otherId) ||
      (e.fromStoryId === otherId && e.toStoryId === self.storyId),
  )
  if (linked) return false
  const [other] = await ctx.db
    .select()
    .from(schema.story)
    .where(and(eq(schema.story.id, otherId), isNotNull(schema.story.publishedAt)))
  const otherInput = other ? await loadStoryInput(ctx.db, otherId) : null
  if (!other || !otherInput) return false

  const selfIsNewer = selfFirstObservedAt >= other.firstObservedAt
  const newer = selfIsNewer ? self : otherInput
  const older = selfIsNewer ? otherInput : self
  const newerSummaryId = selfIsNewer ? job.inputFingerprint : other.currentSummaryId
  const olderSummaryId = selfIsNewer ? other.currentSummaryId : job.inputFingerprint
  const newerInputFingerprint = selfIsNewer ? selfInputFingerprint : other.inputFingerprint
  const olderInputFingerprint = selfIsNewer ? other.inputFingerprint : selfInputFingerprint
  if (!newerSummaryId || !olderSummaryId || !newerInputFingerprint || !olderInputFingerprint)
    return false
  const assessment = await assessStoryRelationship(
    ctx,
    job,
    newer,
    older,
    newerSummaryId,
    olderSummaryId,
    newerInputFingerprint,
    olderInputFingerprint,
    similarity,
  )
  if (assessment.output.decision !== 'related') return false
  // "Related" without a specific type still deserves a (symmetric) link.
  const relation = assessment.output.relation ?? 'related_to'

  const edge = { fromStoryId: newer.storyId, toStoryId: older.storyId, relation }
  const verdict = validateNewEdge(
    edge,
    {
      fromFirstObservedAt: new Date(newer.firstObservedAt),
      toFirstObservedAt: new Date(older.firstObservedAt),
    },
    existing,
  )
  if (!verdict.ok) {
    console.warn(`[relate] rejected edge ${edge.fromStoryId}->${edge.toStoryId}: ${verdict.reason}`)
    return false
  }
  return withTransaction(ctx.pool, async (tx) => {
    const current = await tx.db
      .select({
        id: schema.story.id,
        summaryId: schema.story.currentSummaryId,
        inputFingerprint: schema.story.inputFingerprint,
      })
      .from(schema.story)
      .where(inArray(schema.story.id, [newer.storyId, older.storyId]))
      .for('update')
    const currentById = new Map(current.map((row) => [row.id, row]))
    const currentNewer = currentById.get(newer.storyId)
    const currentOlder = currentById.get(older.storyId)
    if (
      currentNewer?.summaryId !== newerSummaryId ||
      currentNewer?.inputFingerprint !== newerInputFingerprint ||
      currentOlder?.summaryId !== olderSummaryId ||
      currentOlder?.inputFingerprint !== olderInputFingerprint
    )
      throw new RelationshipInputsChangedError('Story inputs changed during relationship inference')
    const added = await tx.db
      .insert(schema.storyRelationship)
      .values({
        id: newId(ID_PREFIX.storyRelationship),
        ...edge,
        analysisRunId: assessment.runId,
        confidence: similarity,
      })
      .onConflictDoNothing()
      .returning({ id: schema.storyRelationship.id })
    if (added.length === 0) return false
    if (relation === 'corrects') {
      await recordStoryUpdate(tx.db, {
        storyId: edge.fromStoryId,
        kind: 'correction_or_clarification',
        description: 'A related story corrects or clarifies this reporting.',
        origin: 'system',
        relatedStoryId: edge.toStoryId,
        analysisRunId: assessment.runId,
      })
    }
    await touchStory(tx.db, edge.fromStoryId, 'story.related', null)
    await touchStory(tx.db, edge.toStoryId, 'story.related', null)
    return true
  })
}

/** Reuse only an exact pair/model/prompt decision; validation still happens at edge insertion. */
async function assessStoryRelationship(
  ctx: WorkerContext,
  job: AnalysisJob,
  newer: StoryInput,
  older: StoryInput,
  newerSummaryId: string,
  olderSummaryId: string,
  newerInputFingerprint: string,
  olderInputFingerprint: string,
  similarity: number,
) {
  const inputFingerprint = [
    `${newer.storyId}:${newerSummaryId}:${newerInputFingerprint}`,
    `${older.storyId}:${olderSummaryId}:${olderInputFingerprint}`,
  ].join('|')
  const [cached] = await ctx.db
    .select({ runId: schema.analysisRun.id, output: schema.interpretation.output })
    .from(schema.analysisRun)
    .innerJoin(
      schema.interpretation,
      eq(schema.interpretation.analysisRunId, schema.analysisRun.id),
    )
    .where(
      and(
        eq(schema.analysisRun.operation, 'story_relationship'),
        eq(schema.analysisRun.status, 'succeeded'),
        eq(schema.analysisRun.targetType, 'story'),
        eq(schema.analysisRun.targetId, newer.storyId),
        eq(schema.analysisRun.modelId, ctx.inference.generation.modelId),
        eq(schema.analysisRun.promptVersion, PROMPT_VERSIONS.classifyRelationship),
        eq(schema.analysisRun.inputFingerprint, inputFingerprint),
        eq(schema.interpretation.type, 'story_relationship'),
      ),
    )
    .limit(1)
  const parsed = cached ? relationshipCandidateSchema.safeParse(cached.output) : null
  if (cached && parsed?.success) return { runId: cached.runId, output: parsed.data }

  const { runId, result } = await runStoryGeneration(
    ctx,
    job,
    {
      operation: 'story_relationship',
      storyId: newer.storyId,
      inputFingerprint,
    },
    () => ctx.inference.generation.classifyRelationship({ newer, older }),
  )
  await ctx.db.insert(schema.interpretation).values({
    id: newId(ID_PREFIX.interpretation),
    type: 'story_relationship',
    subjectType: 'story',
    subjectId: newer.storyId,
    output: { ...result.output, olderStoryId: older.storyId, similarity },
    analysisRunId: runId,
  })
  return { runId, output: result.output }
}

/**
 * Edges `validateNewEdge` needs, without loading the whole graph: any edge between the
 * two Stories, plus temporal edges reachable from either one (enough to detect cycles,
 * whichever Story ends up as the edge target).
 */
export async function edgesForValidation(db: Db, a: string, b: string): Promise<GraphEdge[]> {
  const { rows } = await db.execute<{
    from_story_id: string
    to_story_id: string
    relation: StoryRelation
  }>(sql`
    with recursive reach(id) as (
      select unnest(array[${a}, ${b}]::text[])
      union
      select r.to_story_id from story_relationship r
      join reach on r.from_story_id = reach.id
      where r.superseded_at is null and r.relation in ('follows', 'branches_from', 'responds_to', 'corrects')
    )
    select from_story_id, to_story_id, relation from story_relationship
    where superseded_at is null
      and (from_story_id in (select id from reach) or (from_story_id in (${a}, ${b}) and to_story_id in (${a}, ${b})))`)
  return rows.map((r) => ({
    fromStoryId: r.from_story_id,
    toStoryId: r.to_story_id,
    relation: r.relation,
  }))
}

/**
 * Stories reachable from `storyId` through active timeline edges (bounded BFS). Loose links
 * (related_to, provides_context_for) stay on the Story pages but don't join Narratives:
 * chained, they pulled unrelated Stories together.
 */
export async function narrativeComponent(db: Db, storyId: string) {
  const seen = new Set([storyId])
  let frontier = [storyId]
  while (frontier.length > 0 && seen.size < MAX_NARRATIVE_COMPONENT) {
    const edges = await db
      .select()
      .from(schema.storyRelationship)
      .where(
        and(
          isNull(schema.storyRelationship.supersededAt),
          inArray(schema.storyRelationship.relation, [...TEMPORAL_RELATIONS]),
          or(
            inArray(schema.storyRelationship.fromStoryId, frontier),
            inArray(schema.storyRelationship.toStoryId, frontier),
          ),
        ),
      )
    const next: string[] = []
    for (const e of edges) {
      for (const id of [e.fromStoryId, e.toStoryId]) {
        if (!seen.has(id)) {
          seen.add(id)
          next.push(id)
        }
      }
    }
    frontier = next
  }
  return [...seen]
}

/**
 * Connected Stories share a Narrative. Joins the oldest existing Narrative in the
 * component, or creates one. Narratives are never merged automatically.
 */
async function assignNarrative(
  ctx: WorkerContext,
  job: AnalysisJob,
  storyId: string,
  inputFingerprint: string,
) {
  const members = await narrativeComponent(ctx.db, storyId)
  if (members.length < 2) return

  const memberships = await ctx.db
    .select({ storyId: schema.narrativeStory.storyId, narrative: schema.narrative })
    .from(schema.narrativeStory)
    .innerJoin(schema.narrative, eq(schema.narrative.id, schema.narrativeStory.narrativeId))
    .where(
      and(inArray(schema.narrativeStory.storyId, members), isNull(schema.narrativeStory.removedAt)),
    )
    .orderBy(asc(schema.narrative.createdAt))
  const target = memberships[0]?.narrative
  const alreadyIn = new Set(memberships.map((m) => m.storyId))
  const toAdd = members.filter((id) => !alreadyIn.has(id))
  if (target && toAdd.length === 0) return

  const stories = (
    await Promise.all(members.map((id) => loadStoryInput(ctx.db, id, { max: 3 })))
  ).filter((s): s is StoryInput => s !== null)
  const { runId, result } = await withAnalysisRun(
    ctx.db,
    {
      operation: 'narrative_title',
      targetType: 'narrative',
      targetId: target?.id ?? `new:${storyId}`,
      inputFingerprint: [...members].sort().join(','),
      modelId: ctx.inference.generation.modelId,
    },
    () =>
      ctx.gpu.generation.run(job.priorityClass, () =>
        ctx.inference.generation.titleNarrative({ stories }),
      ),
  )

  await withTransaction(ctx.pool, async (tx) => {
    const [current] = await tx.db
      .select({
        summaryId: schema.story.currentSummaryId,
        inputFingerprint: schema.story.inputFingerprint,
      })
      .from(schema.story)
      .where(eq(schema.story.id, storyId))
      .for('update')
    if (
      current?.summaryId !== job.inputFingerprint ||
      current?.inputFingerprint !== inputFingerprint
    ) {
      throw new RelationshipInputsChangedError('Story inputs changed during narrative inference')
    }
    const now = new Date()
    const interpretationId = newId(ID_PREFIX.interpretation)
    const narrativeId = target?.id ?? newId(ID_PREFIX.narrative)
    await tx.db.insert(schema.interpretation).values({
      id: interpretationId,
      type: 'narrative_title',
      subjectType: 'narrative',
      subjectId: narrativeId,
      output: result.output,
      analysisRunId: runId,
      supersedesInterpretationId: target?.titleInterpretationId ?? null,
    })
    if (target) {
      await tx.db
        .update(schema.narrative)
        .set({
          title: result.output.title,
          description: result.output.description,
          titleInterpretationId: interpretationId,
        })
        .where(eq(schema.narrative.id, target.id))
    } else {
      await tx.db.insert(schema.narrative).values({
        id: narrativeId,
        slug: `${slugify(result.output.title, 60)}-${narrativeId.slice(-6)}`,
        title: result.output.title,
        description: result.output.description,
        updatedAt: now,
        titleInterpretationId: interpretationId,
      })
    }
    if (toAdd.length > 0) {
      await tx.db
        .insert(schema.narrativeStory)
        .values(toAdd.map((id) => ({ narrativeId, storyId: id, addedAt: now })))
        .onConflictDoNothing()
    }
    await touchNarrative(
      tx.db,
      narrativeId,
      target ? 'narrative.updated' : 'narrative.created',
      now,
    )
    for (const id of toAdd) await touchStory(tx.db, id, 'story.narrative_assigned', null)
  })
}
