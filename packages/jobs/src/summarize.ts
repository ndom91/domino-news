import { type Db, schema, withTransaction } from '@dn/db'
import { ID_PREFIX, newId } from '@dn/domain'
import { InvalidModelOutputError } from '@dn/inference'
import type { SummaryUpdateAssessment } from '@dn/schemas'
import {
  type AnalysisJob,
  analysisJob,
  DomainError,
  getInferenceSettings,
  newsroomOutletCount,
  optionalEnrichmentQueues,
  QUEUES,
  recordGeneratedSummary,
  recordStoryUpdate,
} from '@dn/server'
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { sendInTx, type WorkerContext } from './context.ts'
import { type LoadedArticle, loadArticles, loadStoryInput, withTransientBodies } from './inputs.ts'
import { markRunFailed, runStoryGeneration } from './provenance.ts'
import { likelyCorroboration } from './summary-update-prefilter.ts'

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

  // Only Stories covered by enough newsrooms are worth summarising and publishing. When
  // another outlet joins, the fingerprint changes and a new job comes through here.
  const outletCount = await newsroomOutletCount(ctx.db, story.id)
  if (outletCount < ctx.config.minPublishOutlets) {
    return { status: 'below_outlet_threshold' }
  }
  if (story.currentSummaryId && !job.force) {
    const [current] = await ctx.db
      .select({ inputFingerprint: schema.storySummaryVersion.inputFingerprint })
      .from(schema.storySummaryVersion)
      .where(eq(schema.storySummaryVersion.id, story.currentSummaryId))
    if (current?.inputFingerprint === job.inputFingerprint) return { status: 'stale' }
  }

  const assessment =
    story.currentSummaryId && !job.force
      ? await assessSummaryUpdate(
          ctx,
          job,
          story.id,
          story.currentSummaryId,
          job.inputFingerprint,
          (await getInferenceSettings(ctx)).summaryUpdateAssessmentMaxArticles,
        )
      : null
  if (assessment && assessment.output.outcome !== 'material')
    return {
      status: assessment.prefiltered ? 'corroboration_prefilter' : assessment.output.outcome,
    }

  const input = await loadStoryInput(ctx.db, story.id)
  if (!input || input.articles.length === 0) return { status: 'no_articles' }
  const { story: withBodies, primaryLinks } = await withTransientBodies(input)

  const { runId, result } = await runStoryGeneration(
    ctx,
    job,
    { operation: 'story_summary', storyId: story.id, inputFingerprint: job.inputFingerprint },
    () => ctx.inference.generation.summarizeStory({ story: withBodies }),
  )

  const outcome = await withTransaction(ctx.pool, async (tx) => {
    let recorded: Awaited<ReturnType<typeof recordGeneratedSummary>>
    try {
      recorded = await recordGeneratedSummary(tx.db, {
        storyId: story.id,
        output: result.output,
        analysisRunId: runId,
        inputFingerprint: job.inputFingerprint,
        shownArticleIds: input.articles.map((a) => a.articleId),
        force: job.force,
        revision: assessment
          ? {
              description: assessment.output.note,
              articleIds: assessment.output.sourceArticleIds,
              analysisRunId: assessment.runId,
            }
          : undefined,
      })
    } catch (error) {
      // Ungrounded citations are a model-output problem: retryable, never published.
      if (error instanceof DomainError && error.code === 'bad_request') {
        const invalid = new InvalidModelOutputError(error.message)
        // Outside the rolled-back transaction, so the attempt shows as failed on /pipeline.
        await markRunFailed(ctx.db, runId, invalid)
        throw invalid
      }
      throw error
    }
    if (recorded.status !== 'recorded') return recorded

    for (const [articleId, links] of primaryLinks) {
      const refs = links.map((url) => ({ url, kind: 'primary_document' as const }))
      await recordPrimarySources(tx.db, story.id, articleId, refs)
    }
    // An official body's own article is a primary source: claims can cite it as evidence.
    for (const a of input.articles as LoadedArticle[]) {
      if (a.publisherKind !== 'official') continue
      const ref = { url: a.url, title: a.title, kind: 'official_statement' as const }
      await recordPrimarySources(tx.db, story.id, a.articleId, [ref])
    }
    // Revisions update a Story, not its connections to other Stories. Context and claims follow
    // the new summary, while relationship inference remains initial-summary work.
    const next = analysisJob(story.id, recorded.versionId, job.priorityClass)
    const queues = [
      ...(assessment ? [] : [QUEUES.relateStory]),
      ...optionalEnrichmentQueues(outletCount, ctx.config.eagerOptionalEnrichmentOutlets),
    ]
    for (const queue of queues) await sendInTx(ctx, tx, queue, next.data, next.options)
    return recorded
  })
  return outcome
}

// assessSummaryUpdate records one material verdict for a prior-summary/current-input pair.
async function assessSummaryUpdate(
  ctx: WorkerContext,
  job: AnalysisJob,
  storyId: string,
  priorSummaryVersionId: string,
  inputFingerprint: string,
  maxArticles: number,
): Promise<AssessmentResult | null> {
  const [known] = await ctx.db
    .select()
    .from(schema.summaryUpdateAssessment)
    .where(
      and(
        eq(schema.summaryUpdateAssessment.storyId, storyId),
        eq(schema.summaryUpdateAssessment.priorSummaryVersionId, priorSummaryVersionId),
        eq(schema.summaryUpdateAssessment.inputFingerprint, inputFingerprint),
      ),
    )
  if (known) {
    return { prefiltered: false, runId: known.analysisRunId, output: assessmentOutput(known) }
  }
  const [prior] = await ctx.db
    .select({
      body: schema.storySummaryVersion.body,
      createdAt: schema.storySummaryVersion.createdAt,
    })
    .from(schema.storySummaryVersion)
    .where(eq(schema.storySummaryVersion.id, priorSummaryVersionId))
  if (!prior) return null
  const additions = await ctx.db
    .select({ articleId: schema.storyArticle.articleId, addedAt: schema.storyArticle.addedAt })
    .from(schema.storyArticle)
    .where(
      and(
        eq(schema.storyArticle.storyId, storyId),
        isNull(schema.storyArticle.removedAt),
        gt(schema.storyArticle.addedAt, prior.createdAt),
      ),
    )
    .orderBy(desc(schema.storyArticle.addedAt))
    .limit(maxArticles * 3)
  const articles = assessmentArticles(
    await loadArticles(
      ctx.db,
      additions.map((addition) => addition.articleId),
    ),
    additions,
    maxArticles,
  )
  if (articles.length === 0) return null
  if (likelyCorroboration(prior.body, articles)) {
    return {
      prefiltered: true,
      runId: 'metadata-prefilter',
      output: {
        changeKind: null,
        outcome: 'corroboration_only',
        note: '',
        sourceArticleIds: [],
        observationIds: [],
      },
    }
  }
  const pairFingerprint = `${priorSummaryVersionId}:${inputFingerprint}`
  const { runId, result } = await runStoryGeneration(
    ctx,
    job,
    { operation: 'summary_update_assessment', storyId, inputFingerprint: pairFingerprint },
    () =>
      ctx.inference.generation.assessSummaryUpdate({
        update: { storyId, previousSummary: prior.body, articles },
      }),
  )
  try {
    validateAssessment(result.output, articles)
  } catch (error) {
    const invalid = new InvalidModelOutputError(String(error))
    await markRunFailed(ctx.db, runId, invalid)
    throw invalid
  }
  // Corroboration and uncertainty deliberately leave no reader-facing domain record. A completed
  // job is not retried, while material outcomes need durable deduplication before summarising.
  if (result.output.outcome !== 'material') {
    return { prefiltered: false, runId, output: result.output }
  }
  const changeKind = result.output.changeKind
  if (!changeKind) throw new Error('material assessment has no change kind')
  const inserted = await ctx.db
    .insert(schema.summaryUpdateAssessment)
    .values({
      id: newId(ID_PREFIX.summaryUpdateAssessment),
      storyId,
      priorSummaryVersionId,
      inputFingerprint,
      changeKind,
      outcome: result.output.outcome,
      note: result.output.note,
      sourceArticleIds: result.output.sourceArticleIds,
      observationIds: result.output.observationIds,
      analysisRunId: runId,
    })
    .onConflictDoNothing()
    .returning()
  const row = inserted[0]
  if (row) return { prefiltered: false, runId, output: result.output }
  const [raced] = await ctx.db
    .select()
    .from(schema.summaryUpdateAssessment)
    .where(
      and(
        eq(schema.summaryUpdateAssessment.storyId, storyId),
        eq(schema.summaryUpdateAssessment.priorSummaryVersionId, priorSummaryVersionId),
        eq(schema.summaryUpdateAssessment.inputFingerprint, inputFingerprint),
      ),
    )
  if (!raced) throw new Error('summary update assessment was not recorded')

  return { prefiltered: false, runId: raced.analysisRunId, output: assessmentOutput(raced) }
}

type AssessmentResult = {
  prefiltered: boolean
  runId: string
  output: SummaryUpdateAssessment
}

function assessmentArticles(
  articles: LoadedArticle[],
  additions: { articleId: string; addedAt: Date }[],
  maxArticles: number,
) {
  const addedAt = new Map(additions.map((addition) => [addition.articleId, addition.addedAt]))
  const newest = articles.toSorted((a, b) => {
    const aAddedAt = addedAt.get(a.articleId)
    const bAddedAt = addedAt.get(b.articleId)
    return (bAddedAt?.getTime() ?? 0) - (aAddedAt?.getTime() ?? 0)
  })
  const publishers = new Set<string>()
  const out: LoadedArticle[] = []
  for (const article of newest) {
    if (publishers.has(article.publisher)) continue
    publishers.add(article.publisher)
    out.push(article)
    if (out.length === maxArticles) break
  }
  return out
}

function assessmentOutput(
  row: typeof schema.summaryUpdateAssessment.$inferSelect,
): SummaryUpdateAssessment {
  return {
    changeKind: row.changeKind,
    outcome: row.outcome,
    note: row.note,
    sourceArticleIds: row.sourceArticleIds,
    observationIds: row.observationIds,
  }
}

function validateAssessment(output: SummaryUpdateAssessment, articles: LoadedArticle[]) {
  if (output.outcome !== 'material') {
    if (
      output.changeKind ||
      output.note ||
      output.sourceArticleIds.length ||
      output.observationIds.length
    ) {
      throw new Error('non-material assessment includes a note or sources')
    }
    return
  }
  if (
    !output.note ||
    !output.changeKind ||
    output.sourceArticleIds.length === 0 ||
    output.sourceArticleIds.length !== output.observationIds.length
  ) {
    throw new Error('material assessment has no grounded note or sources')
  }
  if (/latest reporting|summary (was )?updated/i.test(output.note)) {
    throw new Error('material assessment note is generic')
  }
  const observations = new Map(
    articles.map((article) => [article.articleId, article.observationId]),
  )
  for (let index = 0; index < output.sourceArticleIds.length; index++) {
    const articleId = output.sourceArticleIds[index]
    const observationId = output.observationIds[index]
    if (!articleId || !observationId || observations.get(articleId) !== observationId) {
      throw new Error('assessment cites an article outside the new active reporting')
    }
  }
}

type SourceRef = {
  url: string
  title?: string
  kind: 'primary_document' | 'official_statement'
}

/** Link sources to a Story. URLs it already has are skipped, so re-summaries add nothing. */
async function recordPrimarySources(db: Db, storyId: string, articleId: string, refs: SourceRef[]) {
  const linked = await db
    .select({ url: schema.sourceReference.url })
    .from(schema.storySourceReference)
    .innerJoin(
      schema.sourceReference,
      eq(schema.sourceReference.id, schema.storySourceReference.sourceReferenceId),
    )
    .where(eq(schema.storySourceReference.storyId, storyId))
  const known = new Set(linked.map((l) => l.url))
  const now = new Date()
  for (const { url, title, kind } of refs) {
    if (known.has(url)) continue
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
        title,
        kind,
        discoveredAt: now,
      })
      .onConflictDoUpdate({ target: schema.sourceReference.url, set: { url } })
      .returning({ id: schema.sourceReference.id })
    if (!ref) continue
    const added = await db
      .insert(schema.storySourceReference)
      .values({ storyId, sourceReferenceId: ref.id, observationId, addedAt: now })
      .onConflictDoNothing()
      .returning({ sourceReferenceId: schema.storySourceReference.sourceReferenceId })
    if (added.length) {
      await recordStoryUpdate(db, {
        storyId,
        kind: 'new_primary_source',
        description: 'A primary source was added to this story.',
        origin: 'system',
        sourceReferenceIds: [ref.id],
      })
    }
  }
}
