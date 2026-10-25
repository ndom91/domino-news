import { schema } from '@dn/db'
import { PROMPT_VERSIONS } from '@dn/inference'
import type { StoryDetail } from '@dn/schemas'
import { and, desc, eq, inArray } from 'drizzle-orm'
import type { ServerContext } from './context.ts'
import { analysisJob, QUEUES } from './queues.ts'

export const OPTIONAL_ENRICHMENT_QUEUES = [QUEUES.generateContext, QUEUES.extractClaims] as const

export function optionalEnrichmentQueues(outletCount: number, eagerMinimum: number) {
  return outletCount >= eagerMinimum ? OPTIONAL_ENRICHMENT_QUEUES : []
}

type EnrichmentState = NonNullable<StoryDetail['enrichment']>
type Operation = 'story_context' | 'story_claims'

const specs: Record<
  keyof EnrichmentState,
  { operation: Operation; promptVersion: string; queue: string }
> = {
  context: {
    operation: 'story_context',
    promptVersion: PROMPT_VERSIONS.explainContext,
    queue: QUEUES.generateContext,
  },
  claims: {
    operation: 'story_claims',
    promptVersion: PROMPT_VERSIONS.extractClaims,
    queue: QUEUES.extractClaims,
  },
}

/** Admit missing optional work when a reader opens a Story; exact failures remain operator-owned. */
export async function ensureOptionalEnrichment(
  ctx: ServerContext,
  storyId: string,
  summaryVersionId: string,
): Promise<EnrichmentState> {
  const runs = await ctx.db
    .select({
      operation: schema.analysisRun.operation,
      promptVersion: schema.analysisRun.promptVersion,
      status: schema.analysisRun.status,
    })
    .from(schema.analysisRun)
    .where(
      and(
        inArray(
          schema.analysisRun.operation,
          Object.values(specs).map((spec) => spec.operation),
        ),
        eq(schema.analysisRun.targetType, 'story'),
        eq(schema.analysisRun.targetId, storyId),
        eq(schema.analysisRun.inputFingerprint, summaryVersionId),
        eq(schema.analysisRun.modelId, ctx.inference.generation.modelId),
      ),
    )
    .orderBy(desc(schema.analysisRun.startedAt))

  let bossPromise: ReturnType<ServerContext['boss']> | null = null
  const entries = await Promise.all(
    (Object.entries(specs) as [keyof EnrichmentState, (typeof specs)[keyof EnrichmentState]][]).map(
      async ([key, spec]) => {
        const exact = runs.filter(
          (run) => run.operation === spec.operation && run.promptVersion === spec.promptVersion,
        )
        if (exact.some((run) => run.status === 'succeeded')) return [key, 'ready'] as const
        if (exact.some((run) => run.status === 'failed')) return [key, 'failed'] as const
        if (!exact.some((run) => run.status === 'running')) {
          const job = analysisJob(storyId, summaryVersionId, 'interactive')
          bossPromise ??= ctx.boss()
          const boss = await bossPromise
          await boss.send(spec.queue, job.data, job.options)
        }
        return [key, 'pending'] as const
      },
    ),
  )
  return Object.fromEntries(entries) as EnrichmentState
}
