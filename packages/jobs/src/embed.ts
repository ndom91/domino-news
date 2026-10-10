import { schema, withTransaction } from '@dn/db'
import { type AnalysisJob, PIPELINE_VERSION, PRIORITY, QUEUES, writeOutbox } from '@dn/server'
import { eq, inArray } from 'drizzle-orm'
import type { Job } from 'pg-boss'
import { sendInTx, type WorkerContext } from './context.ts'

/**
 * Embed a batch of articles (title + description only) in one inference call.
 * Jobs whose revision is no longer current are skipped as stale.
 */
export async function embedArticles(ctx: WorkerContext, jobs: Job<AnalysisJob>[]) {
  const ids = jobs.map((j) => j.data.targetId)
  const rows = await ctx.db
    .select({
      id: schema.article.id,
      latestRevisionId: schema.article.latestRevisionId,
      title: schema.articleRevision.title,
      description: schema.articleRevision.description,
    })
    .from(schema.article)
    .innerJoin(
      schema.articleRevision,
      eq(schema.articleRevision.id, schema.article.latestRevisionId),
    )
    .where(inArray(schema.article.id, ids))
  const current = jobs.flatMap((job) => {
    const row = rows.find((r) => r.id === job.data.targetId)
    return row && row.latestRevisionId === job.data.inputFingerprint ? [{ job, row }] : []
  })
  if (current.length === 0) return

  const cls = current.some((c) => c.job.data.priorityClass === 'interactive')
    ? 'interactive'
    : current.some((c) => c.job.data.priorityClass === 'fresh')
      ? 'fresh'
      : 'backfill'
  const vectors = await ctx.gpu.embeddings.run(cls, () =>
    ctx.inference.embeddings.embedDocuments(
      current.map(({ row }) => ({ title: row.title, text: row.description ?? '' })),
    ),
  )

  for (const [i, { job, row }] of current.entries()) {
    const embedding = vectors[i]
    if (!embedding) throw new Error(`missing embedding for article ${row.id}`)
    await withTransaction(ctx.pool, async (tx) => {
      // Re-check under lock: a newer revision may have landed during the inference call.
      const [locked] = await tx.db
        .select({ latestRevisionId: schema.article.latestRevisionId })
        .from(schema.article)
        .where(eq(schema.article.id, row.id))
        .for('update')
      if (locked?.latestRevisionId !== job.data.inputFingerprint) return
      await tx.db
        .insert(schema.articleEmbedding)
        .values({
          articleId: row.id,
          revisionId: job.data.inputFingerprint,
          modelId: ctx.inference.embeddings.modelId,
          inputFingerprint: job.data.inputFingerprint,
          embedding,
        })
        .onConflictDoUpdate({
          target: schema.articleEmbedding.articleId,
          set: {
            revisionId: job.data.inputFingerprint,
            modelId: ctx.inference.embeddings.modelId,
            inputFingerprint: job.data.inputFingerprint,
            embedding,
            createdAt: new Date(),
          },
        })
      await tx.db
        .update(schema.article)
        .set({ pipelineState: 'embedded' })
        .where(eq(schema.article.id, row.id))
      // Article versions are not tracked; a timestamp keeps outbox ordering monotonic enough.
      await writeOutbox(tx.db, {
        aggregateType: 'article',
        aggregateId: row.id,
        eventType: 'article.embedded',
        version: Math.floor(Date.now() / 1000),
      })
      await sendInTx(ctx, tx, QUEUES.matchArticle, job.data, {
        singletonKey: `${row.id}:${job.data.inputFingerprint}:${PIPELINE_VERSION}`,
        priority: PRIORITY[job.data.priorityClass],
        startAfter: 2, // give the indexer a moment to project the embedding
      })
    })
  }
}
