import { schema, withTransaction } from '@dn/db'
import { ID_PREFIX, newId } from '@dn/domain'
import { InvalidModelOutputError } from '@dn/inference'
import {
  type AnalysisJob,
  analysisJob,
  DomainError,
  QUEUES,
  recordGeneratedSummary,
} from '@dn/server'
import { eq } from 'drizzle-orm'
import { sendInTx, type WorkerContext } from './context.ts'
import { loadStoryInput, withTransientBodies } from './inputs.ts'
import { withAnalysisRun } from './provenance.ts'

/**
 * Generate, validate and record a grounded summary. Stale jobs (story inputs changed)
 * exit early, and a result that becomes stale while generating is discarded.
 */
export async function summarizeStory(ctx: WorkerContext, job: AnalysisJob) {
  const [story] = await ctx.db.select().from(schema.story).where(eq(schema.story.id, job.targetId))
  if (!story || story.inputFingerprint !== job.inputFingerprint) return { status: 'stale' }

  // Only summarise recent stories in live mode; fixtures are always summarised.
  const ageHours = (Date.now() - story.firstObservedAt.getTime()) / 3_600_000
  if (
    ctx.config.ingestMode === 'live' &&
    !story.publishedAt &&
    ageHours > ctx.config.summaryMaxAgeHours
  ) {
    return { status: 'skipped_old' }
  }

  const input = await loadStoryInput(ctx.db, story.id)
  if (!input || input.articles.length === 0) return { status: 'no_articles' }
  const { story: withBodies, primaryLinks } = await withTransientBodies(input)

  const { runId, result } = await withAnalysisRun(
    ctx.db,
    {
      operation: 'story_summary',
      targetType: 'story',
      targetId: story.id,
      inputFingerprint: job.inputFingerprint,
      modelId: ctx.inference.generation.modelId,
    },
    () =>
      ctx.gpu.generation.run(job.priorityClass, () =>
        ctx.inference.generation.summarizeStory({ story: withBodies }),
      ),
  )

  const outcome = await withTransaction(ctx.pool, async (tx) => {
    let recorded: Awaited<ReturnType<typeof recordGeneratedSummary>>
    try {
      recorded = await recordGeneratedSummary(tx.db, {
        storyId: story.id,
        output: result.output,
        analysisRunId: runId,
        inputFingerprint: job.inputFingerprint,
      })
    } catch (error) {
      // Ungrounded citations are a model-output problem: retryable, never published.
      if (error instanceof DomainError && error.code === 'bad_request') {
        throw new InvalidModelOutputError(error.message)
      }
      throw error
    }
    if (recorded.status !== 'recorded') return recorded

    for (const [articleId, links] of primaryLinks) {
      await recordPrimarySources(tx.db, story.id, articleId, links)
    }
    const relate = analysisJob(story.id, recorded.versionId, job.priorityClass)
    await sendInTx(ctx, tx, QUEUES.relateStory, relate.data, relate.options)
    return recorded
  })
  return outcome
}

async function recordPrimarySources(
  db: Parameters<typeof recordGeneratedSummary>[0],
  storyId: string,
  articleId: string,
  links: string[],
) {
  const now = new Date()
  for (const url of links) {
    const observationId = newId(ID_PREFIX.observation)
    await db.insert(schema.observation).values({
      id: observationId,
      type: 'primary_document_found',
      observedAt: now,
      sourceUrl: url,
      collectionMethod: 'web',
      subjectType: 'article',
      subjectId: articleId,
      payload: { url, foundInArticleId: articleId },
      schemaVersion: 1,
    })
    const [ref] = await db
      .insert(schema.sourceReference)
      .values({
        id: newId(ID_PREFIX.sourceReference),
        url,
        kind: 'primary_document',
        discoveredAt: now,
      })
      .onConflictDoUpdate({ target: schema.sourceReference.url, set: { url } })
      .returning({ id: schema.sourceReference.id })
    if (!ref) continue
    await db
      .insert(schema.storySourceReference)
      .values({ storyId, sourceReferenceId: ref.id, observationId, addedAt: now })
      .onConflictDoNothing()
  }
}
