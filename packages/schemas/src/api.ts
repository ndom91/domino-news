import { z } from 'zod'
import { DESKS, deskSchema } from './desks.ts'
import { sourceReferenceKindSchema, storyRelationSchema } from './inference.ts'
import { REGIONS, regionSchema } from './regions.ts'
import { TOPICS, topicSchema } from './topics.ts'

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
  topics: z.array(topicSchema),
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

export const primarySourceSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  kind: sourceReferenceKindSchema,
  discoveredAt: z.string(),
})

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
  /** When the claim was extracted (claims are re-extracted when the summary changes). */
  createdAt: z.string(),
  /** Earliest publish (or first-seen) time among the articles that carry the claim. */
  firstReportedAt: z.string().nullable(),
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
  topics: z.array(topicSchema),
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

const mixEntry = z.object({
  key: z.string(),
  // Share of this outlet's Stories vs share of all published Stories, both 0-1.
  share: z.number(),
  overallShare: z.number(),
})

// Computed facts about what an outlet covers. No judgement or ratings.
export const coverageProfileSchema = z.object({
  days: z.number().int(),
  storyCount: z.number().int().nonnegative(),
  desks: z.array(mixEntry),
  regions: z.array(mixEntry),
  // Share of its Stories that also carry an official source (agency, court…); null if none.
  officialShare: z.number().nullable(),
  // Widely covered Stories from the last 7 days this outlet didn't cover.
  missedMajor: z.object({
    count: z.number().int().nonnegative(),
    examples: z.array(z.object({ id: z.string(), slug: z.string(), title: z.string() })),
  }),
})
export type CoverageProfile = z.infer<typeof coverageProfileSchema>

// Lean is always relative to one country's media (countryContext), never a global axis.
export const publisherLeanSchema = z.enum([
  'left',
  'centre_left',
  'centre',
  'centre_right',
  'right',
])
export type PublisherLean = z.infer<typeof publisherLeanSchema>

export const LEAN_LABELS: Record<PublisherLean, string> = {
  left: 'Left',
  centre_left: 'Centre-left',
  centre: 'Centre',
  centre_right: 'Centre-right',
  right: 'Right',
}

export const fundingModelSchema = z.enum([
  'public_broadcaster',
  'state',
  'commercial',
  'nonprofit',
  'other',
])
export type FundingModel = z.infer<typeof fundingModelSchema>

export const FUNDING_LABELS: Record<FundingModel, string> = {
  public_broadcaster: 'Public broadcaster',
  state: 'State-owned',
  commercial: 'Commercial',
  nonprofit: 'Nonprofit',
  other: 'Other ownership',
}

// Ordinal, best to worst (Wikipedia's perennial-sources labels folded to four steps).
export const reliabilityLevelSchema = z.enum([
  'reliable',
  'no_consensus',
  'unreliable',
  'deprecated',
])
export type ReliabilityLevel = z.infer<typeof reliabilityLevelSchema>

export const RELIABILITY_LABELS: Record<ReliabilityLevel, string> = {
  reliable: 'Generally reliable',
  no_consensus: 'No consensus',
  unreliable: 'Generally unreliable',
  deprecated: 'Deprecated',
}

// Where imported assessment evidence comes from; unknown sources show their raw id.
export const EVIDENCE_SOURCE_LABELS: Record<string, string> = {
  wikidata: 'Wikidata',
  wp_rsp: 'Wikipedia perennial sources',
}

export const assessmentEvidenceSchema = z.object({
  source: z.string(),
  dimension: z.enum(['ownership', 'reliability', 'lean']),
  value: z.string(),
  url: z.string(),
})

// A reviewed snapshot. Only reviewed assessments are ever shown to readers.
export const publisherAssessmentSchema = z.object({
  id: z.string(),
  methodologyVersion: z.string(),
  countryContext: z.string().nullable(),
  fundingModel: fundingModelSchema.nullable(),
  ownership: z.string(),
  reliabilityLevel: reliabilityLevelSchema.nullable(),
  reliability: z.string(),
  lean: publisherLeanSchema.nullable(),
  leanEvidenceUrl: z.string().nullable(),
  leanNote: z.string().nullable(),
  evidence: z.array(assessmentEvidenceSchema),
  reviewedAt: z.string(),
})
export type PublisherAssessment = z.infer<typeof publisherAssessmentSchema>

export const assessmentRequestSchema = z
  .object({
    fundingModel: fundingModelSchema,
    ownership: z.string().trim().min(1).max(500),
    // Null = not rated (e.g. the outlet isn't on Wikipedia's perennial sources list).
    reliabilityLevel: reliabilityLevelSchema.nullable(),
    reliability: z.string().trim().min(1).max(500),
    countryContext: z.string().length(2).nullable(),
    lean: publisherLeanSchema.nullable(),
    leanEvidenceUrl: z.url().nullable(),
    leanNote: z.string().trim().max(500).nullable(),
  })
  .refine((r) => r.lean === null || r.leanEvidenceUrl !== null, {
    message: 'A lean needs a cited source',
    path: ['leanEvidenceUrl'],
  })
export type AssessmentRequest = z.infer<typeof assessmentRequestSchema>

export const evidenceResponseSchema = z.object({
  evidence: z.array(assessmentEvidenceSchema.extend({ retrievedAt: z.string() })),
})
export type EvidenceResponse = z.infer<typeof evidenceResponseSchema>

export const publisherDetailSchema = publisherStatsSchema.extend({
  profile: coverageProfileSchema,
  assessment: publisherAssessmentSchema.nullable(),
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
  // For You picks. Empty = no preference. They rank Stories up, never hide others.
  regions: z.array(regionSchema).max(REGIONS.length),
  desks: z.array(deskSchema).max(DESKS.length),
  topics: z.array(topicSchema).max(TOPICS.length),
  rememberReads: z.boolean(),
  // True once the reader has finished or skipped onboarding. Only ever set to true.
  onboarded: z.boolean(),
})
export type UserPreferences = z.infer<typeof userPreferencesSchema>

// Saves only the fields sent, so one setting can change without resending the rest.
export const userPreferencesUpdateSchema = userPreferencesSchema.partial()
export type UserPreferencesUpdate = z.infer<typeof userPreferencesUpdateSchema>

export const readRequestSchema = z.object({ storyId: z.string().min(1) })

export const followTargetTypeSchema = z.enum(['narrative', 'publisher'])
export type FollowTargetType = z.infer<typeof followTargetTypeSchema>

export const followSchema = z.object({
  targetType: followTargetTypeSchema,
  id: z.string(),
  slug: z.string(),
  title: z.string(),
})
export const followListSchema = z.object({ items: z.array(followSchema) })
export type FollowList = z.infer<typeof followListSchema>

// follow: false unfollows (the API router only supports GET and POST).
export const followRequestSchema = z.object({
  targetType: followTargetTypeSchema,
  targetId: z.string().min(1),
  follow: z.boolean(),
})
export type FollowRequest = z.infer<typeof followRequestSchema>

// A reader's tap on a For You card.
export const feedbackSignalSchema = z.enum(['more', 'less'])
export type FeedbackSignal = z.infer<typeof feedbackSignalSchema>

// Why a Story is on your For You page, shown on the card.
export const forYouReasonSchema = z.object({
  kind: z.enum(['narrative', 'publisher', 'topic', 'region', 'desk', 'learned']),
  label: z.string(),
})
export type ForYouReason = z.infer<typeof forYouReasonSchema>

export const forYouResponseSchema = z.object({
  // False with no picks, follows or learned signals; the page then offers setup.
  personalised: z.boolean(),
  items: z.array(
    z.object({
      story: storyListItemSchema,
      reasons: z.array(forYouReasonSchema),
      // The reader's own tap on this card, if any ("less" cards are hidden).
      feedback: feedbackSignalSchema.nullable(),
    }),
  ),
  pageInfo: pageInfoSchema,
})
export type ForYouResponse = z.infer<typeof forYouResponseSchema>

export const signalKindSchema = z.enum(['topic', 'desk', 'region', 'narrative'])
export type SignalKind = z.infer<typeof signalKindSchema>

// null clears the tap and reverses what it applied (undo).
export const feedbackRequestSchema = z.object({
  storyId: z.string().min(1),
  signal: feedbackSignalSchema.nullable(),
})
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>

export const learnedSignalSchema = z.object({
  kind: signalKindSchema,
  key: z.string(),
  label: z.string(),
  // Current weight after decay; positive = more, negative = less.
  weight: z.number(),
})
export const learnedSignalsSchema = z.object({ items: z.array(learnedSignalSchema) })
export type LearnedSignals = z.infer<typeof learnedSignalsSchema>

export const signalsRequestSchema = z.union([
  z.object({ reset: z.literal(true) }),
  z.object({ remove: z.object({ kind: signalKindSchema, key: z.string() }) }),
])
export type SignalsRequest = z.infer<typeof signalsRequestSchema>

const deskOrRegion = z.union([deskSchema, regionSchema])

export const insightsSchema = z.object({
  // False when reading history is off; the page then offers the opt-in.
  enabled: z.boolean(),
  readCount: z.number().int().nonnegative(),
  // Narratives you read in that have newer Stories you haven't opened.
  missedDevelopments: z.array(
    z.object({ narrative: narrativeRefSchema, stories: z.array(storyListItemSchema) }),
  ),
  // Regions and desks with many Stories this week that you barely read.
  gaps: z.array(
    z.object({
      kind: z.enum(['region', 'desk']),
      key: deskOrRegion,
      storiesThisWeek: z.number().int().nonnegative(),
      yourReads: z.number().int().nonnegative(),
    }),
  ),
})
export type Insights = z.infer<typeof insightsSchema>

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
