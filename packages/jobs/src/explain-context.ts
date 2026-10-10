import { type Db, schema, withTransaction } from '@dn/db'
import { ID_PREFIX, newId, slugify } from '@dn/domain'
import type { StoryContextOutput } from '@dn/schemas'
import type { AnalysisJob } from '@dn/server'
import { eq } from 'drizzle-orm'
import type { WorkerContext } from './context.ts'
import { loadStoryInput } from './inputs.ts'
import { withAnalysisRun } from './provenance.ts'

type Entry = StoryContextOutput['entries'][number]

/**
 * Keep only grounded entries: the anchor must appear verbatim in the summary and every
 * cited observation must belong to this Story's current articles. Others are dropped.
 */
export function validContextEntries(
  entries: Entry[],
  summary: string,
  storyObservationIds: Set<string>,
) {
  const seen = new Set<string>()
  return entries.filter((e) => {
    const key = slugify(e.title)
    if (seen.has(key) || !summary.includes(e.anchorText)) return false
    if (e.sourceObservationIds.length === 0) return false
    if (!e.sourceObservationIds.every((id) => storyObservationIds.has(id))) return false
    seen.add(key)
    return true
  })
}

/**
 * Generate background popovers for a Story's current summary. Job fingerprint = summary
 * version id, so a newer summary makes this job stale. Entries are shared across Stories:
 * a subject explained before is linked, not regenerated into a new version.
 */
export async function explainStoryContext(ctx: WorkerContext, job: AnalysisJob) {
  const [row] = await ctx.db
    .select({ story: schema.story, summary: schema.storySummaryVersion.body })
    .from(schema.story)
    .innerJoin(
      schema.storySummaryVersion,
      eq(schema.storySummaryVersion.id, schema.story.currentSummaryId),
    )
    .where(eq(schema.story.id, job.targetId))
  if (!row || row.story.currentSummaryId !== job.inputFingerprint) return { status: 'stale' }
  const input = await loadStoryInput(ctx.db, row.story.id)
  if (!input) return { status: 'stale' }

  const { runId, result } = await withAnalysisRun(
    ctx.db,
    {
      operation: 'story_context',
      targetType: 'story',
      targetId: row.story.id,
      inputFingerprint: job.inputFingerprint,
      modelId: ctx.inference.generation.modelId,
    },
    () =>
      ctx.gpu.generation.run(job.priorityClass, () =>
        ctx.inference.generation.explainContext({ story: input, summary: row.summary }),
      ),
  )
  const observationIds = new Set(input.articles.map((a) => a.observationId))
  const entries = validContextEntries(result.output.entries, row.summary, observationIds)

  return withTransaction(ctx.pool, async (tx) => {
    const [current] = await tx.db
      .select({ summaryId: schema.story.currentSummaryId })
      .from(schema.story)
      .where(eq(schema.story.id, row.story.id))
      .for('update')
    if (current?.summaryId !== job.inputFingerprint) return { status: 'stale' }
    // Context is derived per summary: replace this Story's links.
    await tx.db.delete(schema.storyContext).where(eq(schema.storyContext.storyId, row.story.id))
    let created = 0
    for (const entry of entries) {
      // One interpretation per entry, so each explanation cites exactly its own sources.
      const interpretationId = newId(ID_PREFIX.interpretation)
      await tx.db.insert(schema.interpretation).values({
        id: interpretationId,
        type: 'context_entry',
        subjectType: 'story',
        subjectId: row.story.id,
        output: entry,
        analysisRunId: runId,
      })
      await tx.db.insert(schema.interpretationEvidence).values(
        [...new Set(entry.sourceObservationIds)].map((observationId) => ({
          interpretationId,
          observationId,
          relationship: 'context' as const,
        })),
      )
      const entryId = await upsertEntry(tx.db, entry, interpretationId, () => created++)
      await tx.db.insert(schema.storyContext).values({
        storyId: row.story.id,
        contextEntryId: entryId,
        anchorText: entry.anchorText,
        interpretationId,
        addedAt: new Date(),
      })
    }
    return {
      status: 'ok',
      entries: entries.length,
      created,
      dropped: result.output.entries.length - entries.length,
    }
  })
}

async function upsertEntry(db: Db, entry: Entry, interpretationId: string, onCreate: () => void) {
  const normalizedKey = slugify(entry.title)
  const [existing] = await db
    .select({ id: schema.contextEntry.id })
    .from(schema.contextEntry)
    .where(eq(schema.contextEntry.normalizedKey, normalizedKey))
  if (existing) return existing.id
  onCreate()
  const id = newId('ctx')
  const versionId = newId('ctxv')
  await db
    .insert(schema.contextEntry)
    .values({ id, kind: entry.kind, title: entry.title, normalizedKey })
  await db.insert(schema.contextEntryVersion).values({
    id: versionId,
    contextEntryId: id,
    explanation: entry.explanation,
    interpretationId,
  })
  await db
    .update(schema.contextEntry)
    .set({ currentVersionId: versionId })
    .where(eq(schema.contextEntry.id, id))
  return id
}
