import { schema } from '@dn/db'
import { PROMPT_VERSIONS } from '@dn/inference'
import type { StoryDetail } from '@dn/schemas'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { ServerContext } from './context.ts'
import { analysisJob, QUEUES } from './queues.ts'

export const OPTIONAL_ENRICHMENT_QUEUES = [QUEUES.generateContext, QUEUES.extractClaims] as const

export const OPTIONAL_ENRICHMENT_SPECS = {
  [QUEUES.generateContext]: {
    kind: 'context',
    promptVersion: PROMPT_VERSIONS.explainContext,
  },
  [QUEUES.extractClaims]: {
    kind: 'claims',
    promptVersion: PROMPT_VERSIONS.extractClaims,
  },
} as const

export function optionalEnrichmentQueues(outletCount: number, eagerMinimum: number) {
  return outletCount >= eagerMinimum ? OPTIONAL_ENRICHMENT_QUEUES : []
}

type EnrichmentState = NonNullable<StoryDetail['enrichment']>
type Spec = {
  kind: keyof EnrichmentState
  queue: (typeof OPTIONAL_ENRICHMENT_QUEUES)[number]
  promptVersion: string
}

/** Admit missing optional work when a reader opens a Story. */
export async function ensureOptionalEnrichment(
  ctx: ServerContext,
  storyId: string,
  summaryVersionId: string,
): Promise<EnrichmentState> {
  const modelId = ctx.inference.generation.modelId
  const specs: [Spec, Spec] = [
    {
      queue: QUEUES.generateContext,
      ...OPTIONAL_ENRICHMENT_SPECS[QUEUES.generateContext],
    },
    {
      queue: QUEUES.extractClaims,
      ...OPTIONAL_ENRICHMENT_SPECS[QUEUES.extractClaims],
    },
  ]
  const completed = await ctx.db
    .select({
      kind: schema.optionalEnrichmentCompletion.kind,
      modelId: schema.optionalEnrichmentCompletion.modelId,
      promptVersion: schema.optionalEnrichmentCompletion.promptVersion,
    })
    .from(schema.optionalEnrichmentCompletion)
    .where(
      and(
        eq(schema.optionalEnrichmentCompletion.storyId, storyId),
        eq(schema.optionalEnrichmentCompletion.summaryVersionId, summaryVersionId),
        inArray(
          schema.optionalEnrichmentCompletion.kind,
          specs.map((spec) => spec.kind),
        ),
      ),
    )

  let bossPromise: ReturnType<ServerContext['boss']> | null = null
  const stateFor = async (spec: Spec): Promise<EnrichmentState[keyof EnrichmentState]> => {
    const ready = completed.some(
      (row) =>
        row.kind === spec.kind &&
        row.modelId === modelId &&
        row.promptVersion === spec.promptVersion,
    )
    if (ready) return 'ready'

    const { rows } = await ctx.db.execute<{ state: string }>(sql`
      select state from pgboss.job
      where name = ${spec.queue}
        and data->>'targetId' = ${storyId}
        and data->>'inputFingerprint' = ${summaryVersionId}
        and data->>'modelId' = ${modelId}
        and data->>'promptVersion' = ${spec.promptVersion}
      order by created_on desc
      limit 1`)
    const state = rows[0]?.state
    if (state === 'failed') return 'failed'
    if (state === 'created' || state === 'retry' || state === 'active') return 'pending'

    const job = analysisJob(storyId, summaryVersionId, 'interactive')
    bossPromise ??= ctx.boss()
    const boss = await bossPromise
    await boss.send(
      spec.queue,
      { ...job.data, modelId, promptVersion: spec.promptVersion },
      job.options,
    )
    return 'pending'
  }

  const [context, claims] = await Promise.all([stateFor(specs[0]), stateFor(specs[1])])
  return { context, claims }
}
