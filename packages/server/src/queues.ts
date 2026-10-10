// Shared pg-boss queue names and priority classes (used by web for ops actions and by workers).
export const QUEUES = {
  pollFeed: 'poll_feed',
  embedArticle: 'embed_article',
  matchArticle: 'match_article',
  summarizeStory: 'build_story_summary',
  relateStory: 'relate_story',
  admitBackfill: 'admit_backfill',
  rebuildSearch: 'rebuild_search_projection',
} as const
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]

export type JobClass = 'interactive' | 'fresh' | 'backfill'

// pg-boss: higher number = fetched first.
export const PRIORITY: Record<JobClass, number> = { interactive: 20, fresh: 10, backfill: 0 }

// Bump when pipeline logic changes in a way that should allow reprocessing.
export const PIPELINE_VERSION = 'p2'

export interface AnalysisJob {
  targetId: string
  inputFingerprint: string
  pipelineVersion: string
  priorityClass: JobClass
  // Never put article bodies or secrets in durable job payloads.
}
