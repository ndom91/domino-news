import { schema } from '@dn/db'
import { PROMPT_VERSIONS } from '@dn/inference'
import type { StoryDetail } from '@dn/schemas'
import { and, eq, sql } from 'drizzle-orm'
import type { ServerContext } from './context.ts'
import { analysisJob, QUEUES } from './queues.ts'

type ContextState = NonNullable<StoryDetail['enrichment']>['context']

/** Context for this summary version; when it is missing, admit the job at interactive priority. */
export async function ensureStoryContext(
  ctx: ServerContext,
  storyId: string,
  summaryVersionId: string,
): Promise<ContextState> {
  const modelId = ctx.inference.generation.modelId
  const promptVersion = PROMPT_VERSIONS.explainContext
  const [completed] = await ctx.db
    .select({ storyId: schema.optionalEnrichmentCompletion.storyId })
    .from(schema.optionalEnrichmentCompletion)
    .where(
      and(
        eq(schema.optionalEnrichmentCompletion.storyId, storyId),
        eq(schema.optionalEnrichmentCompletion.summaryVersionId, summaryVersionId),
        eq(schema.optionalEnrichmentCompletion.kind, 'context'),
        eq(schema.optionalEnrichmentCompletion.modelId, modelId),
        eq(schema.optionalEnrichmentCompletion.promptVersion, promptVersion),
      ),
    )
    .limit(1)
  if (completed) return 'ready'

  const { rows } = await ctx.db.execute<{ state: string }>(sql`
    select state from pgboss.job
    where name = ${QUEUES.generateContext}
      and data->>'targetId' = ${storyId}
      and data->>'inputFingerprint' = ${summaryVersionId}
      and data->>'modelId' = ${modelId}
      and data->>'promptVersion' = ${promptVersion}
    order by created_on desc
    limit 1`)
  const state = rows[0]?.state
  if (state === 'failed') return 'failed'
  if (state === 'created' || state === 'retry' || state === 'active') return 'pending'

  const job = analysisJob(storyId, summaryVersionId, 'interactive')
  const boss = await ctx.boss()
  await boss.send(QUEUES.generateContext, { ...job.data, modelId, promptVersion }, job.options)
  return 'pending'
}
