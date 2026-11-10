import { schema, withTransaction } from '@dn/db'
import { type AnalysisJob, analysisJob, QUEUES } from '@dn/server'
import { eq, inArray } from 'drizzle-orm'
import type { Job } from 'pg-boss'
import { sendInTx, type WorkerContext } from './context.ts'

const MAX_EMBEDDING_DOCUMENT_CHARS = 6000

export function embeddingDocument(title: string, description: string | null) {
  const text = description ?? ''
  const available = Math.max(0, MAX_EMBEDDING_DOCUMENT_CHARS - title.length)
  return {
    title: title.slice(0, MAX_EMBEDDING_DOCUMENT_CHARS),
    text: text.length > available ? text.slice(0, available) : text,
  }
}

/**
 * Embed a batch of articles (title + description only) in one inference call.
 * Each document is bounded independently so a malformed feed cannot exceed the embedding model's
 * context window or block the rest of the batch.
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
      current.map(({ row }) => embeddingDocument(row.title, row.description)),
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
      const next = analysisJob(row.id, job.data.inputFingerprint, job.data.priorityClass)
      await sendInTx(ctx, tx, QUEUES.matchArticle, next.data, next.options)
    })
  }
}
