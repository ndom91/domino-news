import { z } from 'zod'
import { deskSchema } from './desks.ts'
import { sourceReferenceKindSchema, storyRelationSchema } from './inference.ts'
import { regionSchema } from './regions.ts'

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

export const publisherStatsSchema = publisherRefSchema.extend({
  countryCode: z.string().nullable(),
  bodyPolicy: z.enum(['metadata_only', 'transient_body_allowed']),
  kind: z.enum(['newsroom', 'official']),
  license: z.string().nullable(),
  storiesCovered: z.number().int().nonnegative(),
  firstReports: z.number().int().nonnegative(),
  exclusives: z.number().int().nonnegative(),
  articleCount: z.number().int().nonnegative(),
  lastSeenAt: z.string().nullable(),
})
export type PublisherStats = z.infer<typeof publisherStatsSchema>

export const coverageMatrixSchema = z.object({
  publishers: z.array(publisherRefSchema),
  stories: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      title: z.string(),
      lastUpdatedAt: z.string(),
      coverage: z.array(z.object({ publisherId: z.string(), first: z.boolean() })),
    }),
  ),
})
export type CoverageMatrix = z.infer<typeof coverageMatrixSchema>

export const publisherListResponseSchema = z.object({
  items: z.array(publisherStatsSchema),
  matrix: coverageMatrixSchema,
})
export type PublisherListResponse = z.infer<typeof publisherListResponseSchema>

export const storySourceSchema = z.object({
  articleId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  url: z.string(),
  publishedAt: z.string().nullable(),
  observedAt: z.string(),
  publisher: publisherRefSchema,
  // Government, court, regulator or IGO rather than a newsroom.
  official: z.boolean(),
  citedInSummary: z.boolean(),
  // Number used by `[n]` markers in the summary; null if not cited.
  citation: z.number().int().positive().nullable(),
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
  // Desk of its most recently updated Story; drives the Narrative's colour.
  desk: deskSchema.nullable(),
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
  regions: z.array(regionSchema),
  // Null until the Story is summarised with a desk.
  desk: deskSchema.nullable(),
  publishers: z.array(publisherRefSchema),
  narratives: z.array(narrativeRefSchema),
  // When each source reported (publishedAt, else first seen), for coverage traces.
  trace: z.array(
    z.object({
      id: z.string(),
      publisherName: z.string(),
      at: z.string(),
      // 0 = cited without a number (summaries written before citation numbers); null = not cited.
      citation: z.number().int().nonnegative().nullable(),
    }),
  ),
  // The Story's main typed link to an earlier Story, if any (shown as "Follows …").
  relation: z.object({ type: storyRelationSchema, slug: z.string(), title: z.string() }).nullable(),
  primarySource: z.object({ title: z.string().nullable(), url: z.string() }).nullable(),
  // This Story corrects an earlier one.
  correction: z.boolean(),
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

export const storyContextItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(['definition', 'background', 'prerequisite']),
  anchorText: z.string(),
  explanation: z.string(),
  // Articles the explanation was grounded in (may come from an earlier Story).
  sources: z.array(
    z.object({
      articleId: z.string(),
      publisherName: z.string(),
      title: z.string(),
      url: z.string(),
    }),
  ),
})
export type StoryContextItem = z.infer<typeof storyContextItemSchema>

export const storyClaimSchema = z.object({
  id: z.string(),
  proposition: z.string(),
  mentions: z.array(
    z.object({
      stance: z.enum(['asserts', 'denies', 'quotes', 'discusses']),
      articleId: z.string(),
      publisher: publisherRefSchema,
    }),
  ),
  evidence: z.array(
    z.object({
      relationship: z.enum(['supports', 'contradicts', 'context', 'inconclusive']),
      url: z.string(),
      title: z.string().nullable(),
    }),
  ),
})
export type StoryClaim = z.infer<typeof storyClaimSchema>

export const storyDetailSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  status: z.enum(['developing', 'ongoing', 'dormant']),
  firstObservedAt: z.string(),
  lastUpdatedAt: z.string(),
  publishedAt: z.string().nullable(),
  regions: z.array(regionSchema),
  // Null until the Story is summarised with a desk.
  desk: deskSchema.nullable(),
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
  context: z.array(storyContextItemSchema),
  claims: z.array(storyClaimSchema),
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
  desk: deskSchema.nullable(),
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
      desk: deskSchema.nullable(),
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
  region: regionSchema.optional(),
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
    desk: deskSchema.nullable(),
    regions: z.array(regionSchema),
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

export const publisherDetailSchema = publisherStatsSchema.extend({
  languages: z.array(z.string()),
  policyNote: z.string().nullable(),
  policyReviewedAt: z.string().nullable(),
  recentStories: z.array(storyListItemSchema),
  coCoverage: z.array(
    z.object({ publisher: publisherRefSchema, sharedStories: z.number().int().nonnegative() }),
  ),
})
export type PublisherDetail = z.infer<typeof publisherDetailSchema>

export const userPreferencesSchema = z.object({
  edition: regionSchema.nullable(),
})
export type UserPreferences = z.infer<typeof userPreferencesSchema>

// A Narrative's Stories as a list of steps, oldest first (front page Developing band).
export const narrativeStepSchema = z.object({
  storyId: z.string(),
  slug: z.string(),
  title: z.string(),
  firstObservedAt: z.string(),
  // Typed link to an earlier Story in the same Narrative.
  relation: z.object({ type: storyRelationSchema, title: z.string(), at: z.string() }).nullable(),
  // When a later Story corrected this one.
  correctedAt: z.string().nullable(),
})
export type NarrativeStep = z.infer<typeof narrativeStepSchema>

export const developingNarrativeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  desk: deskSchema.nullable(),
  storyCount: z.number().int().nonnegative(),
  since: z.string(),
  updatedAt: z.string(),
  steps: z.array(narrativeStepSchema),
})
export type DevelopingNarrative = z.infer<typeof developingNarrativeSchema>

// Everything above the Latest grid: strip stats, lead Story and the Developing band.
export const frontPageSchema = z.object({
  editionAt: z.string(),
  stats: z.object({
    stories: z.number().int().nonnegative(),
    publishers: z.number().int().nonnegative(),
  }),
  lead: storyDetailSchema.nullable(),
  // "Story 3 of 6" within the lead's Narrative.
  leadPosition: z
    .object({ index: z.number().int().positive(), total: z.number().int() })
    .nullable(),
  developing: z.array(developingNarrativeSchema),
  narrativeCount: z.number().int().nonnegative(),
})
export type FrontPage = z.infer<typeof frontPageSchema>
