import { z } from 'zod'
import { sourceReferenceKindSchema, storyRelationSchema } from './inference.ts'

// Versioned HTTP contracts (/api/v1). Shared by web and future native clients;
// keep this file free of DOM, Node and framework imports.

export const apiErrorCodeSchema = z.enum([
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'unavailable',
  'internal',
])
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
})
export type ApiErrorBody = z.infer<typeof apiErrorSchema>

export const publisherRefSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  domain: z.string(),
})
export type PublisherRef = z.infer<typeof publisherRefSchema>

export const storySourceSchema = z.object({
  articleId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  publishedAt: z.string().nullable(),
  observedAt: z.string(),
  publisher: publisherRefSchema,
  citedInSummary: z.boolean(),
})
export type StorySource = z.infer<typeof storySourceSchema>

export const summarySchema = z.object({
  versionId: z.string(),
  headline: z.string(),
  body: z.string(),
  format: z.enum(['paragraph', 'bullets']),
  createdAt: z.string(),
  origin: z.enum(['generated', 'edited']),
  modelId: z.string().nullable(),
  citedArticleIds: z.array(z.string()),
})
export type Summary = z.infer<typeof summarySchema>

export const narrativeRefSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
})
export type NarrativeRef = z.infer<typeof narrativeRefSchema>

export const storyListItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  status: z.enum(['developing', 'ongoing', 'dormant']),
  firstObservedAt: z.string(),
  lastUpdatedAt: z.string(),
  sourceCount: z.number().int().nonnegative(),
  publishers: z.array(publisherRefSchema),
  narratives: z.array(narrativeRefSchema),
})
export type StoryListItem = z.infer<typeof storyListItemSchema>

export const pageInfoSchema = z.object({
  nextCursor: z.string().nullable(),
})

export const storyListResponseSchema = z.object({
  items: z.array(storyListItemSchema),
  pageInfo: pageInfoSchema,
})
export type StoryListResponse = z.infer<typeof storyListResponseSchema>

export const relatedStorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  relation: storyRelationSchema,
  direction: z.enum(['outgoing', 'incoming']),
  lastUpdatedAt: z.string(),
})
export type RelatedStory = z.infer<typeof relatedStorySchema>

export const primarySourceSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  kind: sourceReferenceKindSchema,
  discoveredAt: z.string(),
})
export type PrimarySource = z.infer<typeof primarySourceSchema>

export const storyDetailSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  status: z.enum(['developing', 'ongoing', 'dormant']),
  firstObservedAt: z.string(),
  lastUpdatedAt: z.string(),
  publishedAt: z.string().nullable(),
  summary: summarySchema.nullable(),
  summaryHistory: z.array(
    z.object({
      versionId: z.string(),
      createdAt: z.string(),
      origin: z.enum(['generated', 'edited']),
    }),
  ),
  sources: z.array(storySourceSchema),
  related: z.array(relatedStorySchema),
  narratives: z.array(narrativeRefSchema),
  primarySources: z.array(primarySourceSchema),
})
export type StoryDetail = z.infer<typeof storyDetailSchema>

export const narrativeNodeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  firstObservedAt: z.string(),
  lastUpdatedAt: z.string(),
  sourceCount: z.number().int().nonnegative(),
})
export type NarrativeNode = z.infer<typeof narrativeNodeSchema>

export const narrativeEdgeSchema = z.object({
  id: z.string(),
  fromStoryId: z.string(),
  toStoryId: z.string(),
  relation: storyRelationSchema,
})
export type NarrativeEdge = z.infer<typeof narrativeEdgeSchema>

export const narrativeDetailSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  stories: z.array(narrativeNodeSchema),
  edges: z.array(narrativeEdgeSchema),
})
export type NarrativeDetail = z.infer<typeof narrativeDetailSchema>

export const narrativeListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      storyCount: z.number().int().nonnegative(),
      updatedAt: z.string(),
    }),
  ),
})
export type NarrativeListResponse = z.infer<typeof narrativeListResponseSchema>

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  type: z.enum(['all', 'story', 'narrative']).default('all'),
  publisher: z.string().optional(),
  since: z.enum(['24h', '7d', '30d', 'all']).default('all'),
})
export type SearchQuery = z.infer<typeof searchQuerySchema>

export const searchHitSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('story'),
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    summary: z.string().nullable(),
    lastUpdatedAt: z.string(),
    sourceCount: z.number().int().nonnegative(),
    publisherNames: z.array(z.string()),
    score: z.number().nullable(),
  }),
  z.object({
    type: z.literal('narrative'),
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    updatedAt: z.string(),
    storyCount: z.number().int().nonnegative(),
    score: z.number().nullable(),
  }),
])
export type SearchHit = z.infer<typeof searchHitSchema>

export const searchResponseSchema = z.object({
  query: z.string(),
  mode: z.enum(['hybrid', 'keyword']),
  hits: z.array(searchHitSchema),
})
export type SearchResponse = z.infer<typeof searchResponseSchema>

export const summaryEditRequestSchema = z.object({
  headline: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
  basedOnVersionId: z.string(),
})
export type SummaryEditRequest = z.infer<typeof summaryEditRequestSchema>

export const opsStatusSchema = z.object({
  inferenceMode: z.enum(['fixture', 'local']),
  backfillPaused: z.boolean(),
  feeds: z.array(
    z.object({
      id: z.string(),
      publisherName: z.string(),
      url: z.string(),
      enabled: z.boolean(),
      lastPolledAt: z.string().nullable(),
      lastStatus: z.string().nullable(),
      lastError: z.string().nullable(),
      articleCount: z.number().int(),
    }),
  ),
  queues: z.array(
    z.object({
      name: z.string(),
      queued: z.number().int(),
      active: z.number().int(),
      failed: z.number().int(),
      oldestQueuedAgeSeconds: z.number().nullable(),
    }),
  ),
  pipeline: z.object({
    articles: z.number().int(),
    articlesEmbedded: z.number().int(),
    articlesMatched: z.number().int(),
    stories: z.number().int(),
    storiesPublished: z.number().int(),
    narratives: z.number().int(),
    outboxPending: z.number().int(),
    outboxFailed: z.number().int(),
    oldestOutboxAgeSeconds: z.number().nullable(),
  }),
  recentFailures: z.array(
    z.object({
      id: z.string(),
      queue: z.string(),
      failedAt: z.string().nullable(),
      error: z.string().nullable(),
    }),
  ),
  recentRuns: z.array(
    z.object({
      id: z.string(),
      operation: z.string(),
      status: z.string(),
      modelId: z.string(),
      startedAt: z.string(),
      error: z.string().nullable(),
    }),
  ),
})
export type OpsStatus = z.infer<typeof opsStatusSchema>

export const opsActionSchema = z.object({
  action: z.enum(['pause_backfill', 'resume_backfill', 'poll_all_feeds', 'rebuild_search']),
})
export type OpsAction = z.infer<typeof opsActionSchema>
