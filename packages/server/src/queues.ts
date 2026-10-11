// Shared pg-boss queue names and priority classes (used by web for ops actions and by workers).
export const QUEUES = {
  pollAllFeeds: 'poll_all_feeds',
  pollFeed: 'poll_feed',
  embedArticle: 'embed_article',
  matchArticle: 'match_article',
  summarizeStory: 'build_story_summary',
  relateStory: 'relate_story',
  generateContext: 'generate_context',
  extractClaims: 'extract_claims',
  admitBackfill: 'admit_backfill',
  rebuildSearch: 'rebuild_search_projection',
  pruneEvents: 'prune_delivered_events',
} as const

// Everything keyed on a Story's current summary version.
export const ENRICHMENT_QUEUES = [QUEUES.relateStory, QUEUES.generateContext, QUEUES.extractClaims]

export type JobClass = 'interactive' | 'fresh' | 'backfill'

// pg-boss: higher number = fetched first.
export const PRIORITY: Record<JobClass, number> = { interactive: 20, fresh: 10, backfill: 0 }

// Bump when pipeline logic changes in a way that should allow reprocessing.
export const PIPELINE_VERSION = 'p2'

/**
 * Payload and send options for an analysis job. The singleton key (target + input
 * fingerprint + pipeline version, scoped per queue) is what makes duplicate work collapse
 * under the `exclusive` queue policy, so it is built here and nowhere else.
 */
export function analysisJob(targetId: string, inputFingerprint: string, priorityClass: JobClass) {
  const data: AnalysisJob = {
    targetId,
    inputFingerprint,
    pipelineVersion: PIPELINE_VERSION,
    priorityClass,
  }
  return {
    data,
    options: {
      singletonKey: `${targetId}:${inputFingerprint}:${PIPELINE_VERSION}`,
      priority: PRIORITY[priorityClass],
    },
  }
}

export interface AnalysisJob {
  targetId: string
  inputFingerprint: string
  pipelineVersion: string
  priorityClass: JobClass
  // Never put article bodies or secrets in durable job payloads.
}
