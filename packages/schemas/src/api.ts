import { z } from 'zod/mini'
import { DESKS, deskSchema } from './desks.ts'
import { sourceReferenceKindSchema, storyRelationSchema } from './inference.ts'
import { localScopeSchema, placeSchema } from './places.ts'
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
    issues: z.optional(z.array(z.object({ path: z.string(), message: z.string() }))),
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

// Lean labels use Domino's shared product scale. countryContext preserves the source market for
// the evidence behind an assessment and for country-specific insights.
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

// Where a published lean comes from: a survey or rating (sourced), or Domino's own
// documented research where none exists (estimated, rubric docs/prompts/lean-estimate.md).
export const leanBasisSchema = z.enum(['sourced', 'estimated'])
export type LeanBasis = z.infer<typeof leanBasisSchema>

// Which side of centre a lean sits on. Centre is neither.
export const leanSideSchema = z.enum(['left', 'right'])
export type LeanSide = z.infer<typeof leanSideSchema>

export const publisherStatsSchema = z.extend(publisherRefSchema, {
  countryCode: z.nullable(z.string()),
  bodyPolicy: z.enum(['metadata_only', 'transient_body_allowed']),
  kind: z.enum(['newsroom', 'official']),
  license: z.nullable(z.string()),
  storiesCovered: z.int().check(z.nonnegative()),
  firstReports: z.int().check(z.nonnegative()),
  exclusives: z.int().check(z.nonnegative()),
  articleCount: z.int().check(z.nonnegative()),
  lastSeenAt: z.nullable(z.string()),
  // From the latest reviewed assessment; null = not assessed.
  lean: z.nullable(publisherLeanSchema),
  leanBasis: z.nullable(leanBasisSchema),
  leanCountry: z.nullable(z.string()),
})
export type PublisherStats = z.infer<typeof publisherStatsSchema>

export const publisherListResponseSchema = z.object({
  items: z.array(publisherStatsSchema),
})
export type PublisherListResponse = z.infer<typeof publisherListResponseSchema>

export const storySourceSchema = z.object({
  articleId: z.string(),
  title: z.string(),
  description: z.nullable(z.string()),
  url: z.string(),
  publishedAt: z.nullable(z.string()),
  observedAt: z.string(),
  publisher: publisherRefSchema,
  // Government, court, regulator or IGO rather than a newsroom.
  official: z.boolean(),
  citedInSummary: z.boolean(),
  // Number used by `[n]` markers in the summary; null if not cited.
  citation: z.nullable(z.int().check(z.positive())),
})
export type StorySource = z.infer<typeof storySourceSchema>

export const summarySchema = z.object({
  versionId: z.string(),
  headline: z.string(),
  body: z.string(),
  // Story page only: 2-3 paragraphs separated by blank lines. Null on older summaries.
  detail: z.nullable(z.string()),
  format: z.enum(['paragraph', 'bullets']),
  createdAt: z.string(),
  origin: z.enum(['generated', 'edited']),
  modelId: z.nullable(z.string()),
  citedArticleIds: z.array(z.string()),
})
export type Summary = z.infer<typeof summarySchema>

export const narrativeRefSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  // Desk of its most recently updated Story; drives the Narrative's colour.
  desk: z.nullable(deskSchema),
})
export type NarrativeRef = z.infer<typeof narrativeRefSchema>

export const storyListItemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.nullable(z.string()),
  status: z.enum(['developing', 'ongoing', 'dormant']),
  firstObservedAt: z.string(),
  lastUpdatedAt: z.string(),
  sourceCount: z.int().check(z.nonnegative()),
  regions: z.array(regionSchema),
  topics: z.array(topicSchema),
  // Null until the Story is summarised with a desk.
  desk: z.nullable(deskSchema),
  publishers: z.array(publisherRefSchema),
  narratives: z.array(narrativeRefSchema),
  // When each source reported (publishedAt, else first seen), for coverage traces.
  trace: z.array(
    z.object({
      id: z.string(),
      publisherName: z.string(),
      at: z.string(),
      // 0 = cited without a number (summaries written before citation numbers); null = not cited.
      citation: z.nullable(z.int().check(z.nonnegative())),
    }),
  ),
  // The Story's main typed link to an earlier Story, if any (shown as "Follows …").
  relation: z.nullable(
    z.object({ type: storyRelationSchema, slug: z.string(), title: z.string() }),
  ),
  primarySource: z.nullable(z.object({ title: z.nullable(z.string()), url: z.string() })),
  // This Story corrects an earlier one.
  correction: z.boolean(),
})
export type StoryListItem = z.infer<typeof storyListItemSchema>

export const pageInfoSchema = z.object({
  nextCursor: z.nullable(z.string()),
})

export const storyListResponseSchema = z.object({
  items: z.array(storyListItemSchema),
  pageInfo: pageInfoSchema,
})
export type StoryListResponse = z.infer<typeof storyListResponseSchema>

export const localFeedResponseSchema = z.object({
  locality: z.nullable(placeSchema),
  source: z.nullable(z.enum(['saved', 'request'])),
  items: z.array(z.object({ story: storyListItemSchema, scope: localScopeSchema })),
  pageInfo: pageInfoSchema,
})
export type LocalFeedResponse = z.infer<typeof localFeedResponseSchema>

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
  title: z.nullable(z.string()),
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
  firstReportedAt: z.nullable(z.string()),
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
      title: z.nullable(z.string()),
    }),
  ),
})
export type StoryClaim = z.infer<typeof storyClaimSchema>

// The covering publishers in one country, with their reviewed lean. Leans are only
// comparable within a country, so a Story gets one of these per country.
export const storyLeanSchema = z.object({
  country: z.string(),
  publishers: z.array(
    z.object({
      publisher: publisherRefSchema,
      lean: z.nullable(publisherLeanSchema),
      estimated: z.boolean(),
    }),
  ),
  // Set when enough sourced ratings sit mostly on one side (see `oneSidedCoverage`).
  // Estimates never set it.
  oneSided: z.nullable(leanSideSchema),
})
export type StoryLean = z.infer<typeof storyLeanSchema>

export const storyDetailSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  status: z.enum(['developing', 'ongoing', 'dormant']),
  firstObservedAt: z.string(),
  lastUpdatedAt: z.string(),
  publishedAt: z.nullable(z.string()),
  regions: z.array(regionSchema),
  topics: z.array(topicSchema),
  // Null until the Story is summarised with a desk.
  desk: z.nullable(deskSchema),
  summary: z.nullable(summarySchema),
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
  enrichment: z.optional(
    z.object({
      context: z.enum(['pending', 'ready', 'failed']),
      claims: z.enum(['pending', 'ready', 'failed']),
    }),
  ),
  // Newsroom publishers only, most rated first. Publishers without a country are left out.
  leanMix: z.array(storyLeanSchema),
})
export type StoryDetail = z.infer<typeof storyDetailSchema>

export const storyUpdateKindSchema = z.enum([
  'new_reporting',
  'official_response',
  'consequence',
  'new_primary_source',
  'correction_or_clarification',
  'analysis',
  'summary_revision',
])
export type StoryUpdateKind = z.infer<typeof storyUpdateKindSchema>

export const storyUpdateEventSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  kind: storyUpdateKindSchema,
  description: z.string(),
  origin: z.enum(['system', 'model', 'editor']),
  createdAt: z.string(),
  relatedStory: z.nullable(z.object({ id: z.string(), slug: z.string(), title: z.string() })),
  // Exact stored summary versions; the client can show a reader-controlled before/after comparison.
  summaryDiff: z.nullable(z.object({ previous: z.nullable(z.string()), current: z.string() })),
  sources: z.array(
    z.object({
      type: z.enum(['article', 'primary_source']),
      title: z.string(),
      description: z.nullable(z.string()),
      url: z.string(),
      publisher: z.nullable(publisherRefSchema),
    }),
  ),
})
export type StoryUpdateEvent = z.infer<typeof storyUpdateEventSchema>

export const storyUpdatesResponseSchema = z.object({ items: z.array(storyUpdateEventSchema) })
export type StoryUpdatesResponse = z.infer<typeof storyUpdatesResponseSchema>

// What the lead block (HeroStory) shows; the front page sends only this.
export const storyLeadSchema = z.extend(
  z.pick(storyDetailSchema, {
    id: true,
    slug: true,
    title: true,
    desk: true,
    sources: true,
    narratives: true,
    context: true,
  }),
  { summary: z.nullable(z.omit(summarySchema, { detail: true })) },
)
export type StoryLead = z.infer<typeof storyLeadSchema>

export const narrativeNodeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.nullable(z.string()),
  firstObservedAt: z.string(),
  lastUpdatedAt: z.string(),
  sourceCount: z.int().check(z.nonnegative()),
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
  desk: z.nullable(deskSchema),
  description: z.nullable(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  stories: z.array(narrativeNodeSchema),
  edges: z.array(narrativeEdgeSchema),
})
export type NarrativeDetail = z.infer<typeof narrativeDetailSchema>

/**
 * What a signed-out visitor (or a link-preview crawler) may see of a page: enough for a share
 * card and a teaser, never the full content. Served without a session.
 */
export const previewTypeSchema = z.enum(['story', 'narrative', 'publisher'])
export type PreviewType = z.infer<typeof previewTypeSchema>
export const previewSchema = z.object({
  type: previewTypeSchema,
  slug: z.string(),
  title: z.string(),
  /** Desk, or desk · narrative: a small label above the title. */
  kicker: z.string(),
  /** One plain-text sentence, no citations. */
  description: z.nullable(z.string()),
  desk: z.nullable(deskSchema),
  /** Changes when the share image should: the summary version, or the last update. */
  version: z.string(),
})
export type Preview = z.infer<typeof previewSchema>

export const narrativeListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      title: z.string(),
      description: z.nullable(z.string()),
      desk: z.nullable(deskSchema),
      storyCount: z.int().check(z.nonnegative()),
      updatedAt: z.string(),
    }),
  ),
})
export type NarrativeListResponse = z.infer<typeof narrativeListResponseSchema>

export const searchQuerySchema = z.object({
  q: z.string().check(z.trim(), z.minLength(1), z.maxLength(200)),
  type: z._default(z.enum(['all', 'story', 'narrative']), 'all'),
  publisher: z.optional(z.string()),
  since: z._default(z.enum(['24h', '7d', '30d', 'all']), 'all'),
  region: z.optional(regionSchema),
})
export type SearchQuery = z.infer<typeof searchQuerySchema>

export const searchHitSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('story'),
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    summary: z.nullable(z.string()),
    lastUpdatedAt: z.string(),
    sourceCount: z.int().check(z.nonnegative()),
    publisherNames: z.array(z.string()),
    desk: z.nullable(deskSchema),
    regions: z.array(regionSchema),
    score: z.nullable(z.number()),
  }),
  z.object({
    type: z.literal('narrative'),
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    description: z.nullable(z.string()),
    updatedAt: z.string(),
    storyCount: z.int().check(z.nonnegative()),
    score: z.nullable(z.number()),
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
  headline: z.string().check(z.trim(), z.minLength(1), z.maxLength(200)),
  body: z.string().check(z.trim(), z.minLength(1), z.maxLength(4000)),
  // Omitted keeps the current detail; empty removes it.
  detail: z.optional(z.string().check(z.trim(), z.maxLength(8000))),
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
      lastPolledAt: z.nullable(z.string()),
      lastStatus: z.nullable(z.string()),
      lastError: z.nullable(z.string()),
      articleCount: z.int(),
    }),
  ),
  queues: z.array(
    z.object({
      name: z.string(),
      queued: z.int(),
      active: z.int(),
      failed: z.int(),
      oldestQueuedAgeSeconds: z.nullable(z.number()),
    }),
  ),
  pipeline: z.object({
    articles: z.int(),
    articlesEmbedded: z.int(),
    articlesMatched: z.int(),
    stories: z.int(),
    storiesPublished: z.int(),
    narratives: z.int(),
    outboxPending: z.int(),
    outboxFailed: z.int(),
    oldestOutboxAgeSeconds: z.nullable(z.number()),
  }),
  inference: z.object({
    settings: z.object({
      publishedSummaryDebounceSeconds: z.int().check(z.nonnegative()),
      summaryUpdateAssessmentMaxArticles: z.int().check(z.positive()),
      embeddingConcurrency: z.int().check(z.positive()),
      generationConcurrency: z.int().check(z.positive()),
    }),
    windowHours: z.int(),
    summaryJobs: z.object({
      completed: z.int(),
      corroborationOnly: z.int(),
      prefiltered: z.int(),
      recorded: z.int(),
      stale: z.int(),
      uncertain: z.int(),
    }),
    updateAssessments: z.object({
      averageDurationSeconds: z.nullable(z.number()),
      failed: z.int(),
      succeeded: z.int(),
    }),
  }),
  recentRuns: z.array(
    z.object({
      id: z.string(),
      operation: z.string(),
      status: z.string(),
      modelId: z.string(),
      startedAt: z.string(),
      error: z.nullable(z.string()),
    }),
  ),
})
export type OpsStatus = z.infer<typeof opsStatusSchema>

export const INFERENCE_SETTINGS_LIMITS = {
  publishedSummaryDebounceSeconds: { min: 30, max: 900 },
  summaryUpdateAssessmentMaxArticles: { min: 1, max: 10 },
} as const

export const inferenceSettingsUpdateSchema = z.object({
  publishedSummaryDebounceSeconds: z.int().check(z.nonnegative()),
  summaryUpdateAssessmentMaxArticles: z.int().check(z.positive()),
})
export type InferenceSettingsUpdate = z.infer<typeof inferenceSettingsUpdateSchema>

export const opsActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.enum(['pause_backfill', 'resume_backfill', 'poll_all_feeds', 'rebuild_search']),
  }),
  z.object({
    action: z.literal('update_inference_settings'),
    settings: inferenceSettingsUpdateSchema,
  }),
  // Failed jobs: retry puts them back in the queue, dismiss deletes them. No ids = every
  // failed job in the queue.
  z.object({
    action: z.enum(['retry_jobs', 'dismiss_jobs']),
    queue: z.string(),
    ids: z.optional(z.array(z.string()).check(z.minLength(1), z.maxLength(100))),
  }),
])
export type OpsAction = z.infer<typeof opsActionSchema>

// A job that used up its retries. pg-boss keeps it for 3 days (FAILED_JOB_RETENTION_DAYS).
export const failedJobSchema = z.object({
  id: z.string(),
  queue: z.string(),
  createdAt: z.string(),
  failedAt: z.nullable(z.string()),
  attempts: z.int(),
  maxAttempts: z.int(),
  error: z.nullable(z.string()),
  stack: z.nullable(z.string()),
  payload: z.unknown(),
  // What the job was working on, when its payload names a Story or an article.
  target: z.nullable(
    z.object({
      type: z.enum(['story', 'article']),
      id: z.string(),
      title: z.string(),
      // Story page (published Stories only) or the article's own URL.
      href: z.nullable(z.string()),
    }),
  ),
  // The target's latest analysis runs for this job's operation, newest first.
  runs: z.array(
    z.object({
      id: z.string(),
      status: z.string(),
      startedAt: z.string(),
      modelId: z.string(),
      promptVersion: z.string(),
      error: z.nullable(z.string()),
    }),
  ),
})
export type FailedJob = z.infer<typeof failedJobSchema>

export const failedJobsResponseSchema = z.object({
  items: z.array(failedJobSchema),
  pageInfo: pageInfoSchema,
})
export type FailedJobsResponse = z.infer<typeof failedJobsResponseSchema>

export const FAILED_JOB_RETENTION_DAYS = 3

// How well articles are grouped into stories, from live data. See docs/006 "Match quality".
export const matchHealthSchema = z.object({
  computedAt: z.string(),
  // Stories first seen in the last 7 days, and the 7 days before, for a trend.
  stories: z.object({
    recent: z.object({ total: z.int(), singletons: z.int() }),
    previous: z.object({ total: z.int(), singletons: z.int() }),
  }),
  // How articles joined stories in the last 7 days.
  placements: z.object({ newStory: z.int(), embedding: z.int(), model: z.int() }),
  // The model's answers in the last 7 days.
  model: z.object({
    calls: z.int(),
    pickedStory: z.int(),
    pickedNone: z.int(),
    failed: z.int(),
  }),
  // Near-identical articles from different publishers that sit in different stories: likely
  // missed merges (last 3 days, within 48 hours of each other).
  splitPairs: z.object({
    count: z.int(),
    sampleLimit: z.int(),
    threshold: z.number(),
    worst: z.array(
      z.object({
        similarity: z.number(),
        a: z.object({
          title: z.string(),
          publisher: z.string(),
          storyTitle: z.string(),
          storySlug: z.nullable(z.string()),
        }),
        b: z.object({
          title: z.string(),
          publisher: z.string(),
          storyTitle: z.string(),
          storySlug: z.nullable(z.string()),
        }),
      }),
    ),
  }),
})
export type MatchHealth = z.infer<typeof matchHealthSchema>

const mixEntry = z.object({
  key: z.string(),
  // Share of this outlet's Stories vs share of all published Stories, both 0-1.
  share: z.number(),
  overallShare: z.number(),
})

// Computed facts about what an outlet covers. No judgement or ratings.
export const coverageProfileSchema = z.object({
  days: z.int(),
  storyCount: z.int().check(z.nonnegative()),
  desks: z.array(mixEntry),
  regions: z.array(mixEntry),
  // Share of its Stories that also carry an official source (agency, court…); null if none.
  officialShare: z.nullable(z.number()),
  // Widely covered Stories from the last 7 days this outlet didn't cover.
  missedMajor: z.object({
    count: z.int().check(z.nonnegative()),
    examples: z.array(z.object({ id: z.string(), slug: z.string(), title: z.string() })),
  }),
})
export type CoverageProfile = z.infer<typeof coverageProfileSchema>

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
  allsides: 'AllSides',
  domino_estimate: 'Domino estimate',
  reuters_dnr: 'Reuters Institute Digital News Report',
}

// Licence notices that must travel with a source's evidence wherever it is shown.
export const EVIDENCE_ATTRIBUTION: Record<string, { text: string; url: string }> = {
  allsides: {
    text: 'AllSides Media Bias Ratings™ by AllSides.com are licensed under CC BY-NC 4.0',
    url: 'https://creativecommons.org/licenses/by-nc/4.0/',
  },
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
  countryContext: z.nullable(z.string()),
  fundingModel: z.nullable(fundingModelSchema),
  ownership: z.string(),
  reliabilityLevel: z.nullable(reliabilityLevelSchema),
  reliability: z.string(),
  lean: z.nullable(publisherLeanSchema),
  leanBasis: z.nullable(leanBasisSchema),
  leanEvidenceUrl: z.nullable(z.string()),
  leanNote: z.nullable(z.string()),
  evidence: z.array(assessmentEvidenceSchema),
  reviewedAt: z.string(),
})
export type PublisherAssessment = z.infer<typeof publisherAssessmentSchema>

export const assessmentRequestSchema = z
  .object({
    fundingModel: fundingModelSchema,
    // A review can publish a sourced lean before ownership research is complete.
    ownership: z.string().check(z.maxLength(500)),
    // Null = not rated (e.g. the outlet isn't on Wikipedia's perennial sources list).
    reliabilityLevel: z.nullable(reliabilityLevelSchema),
    reliability: z.string().check(z.maxLength(500)),
    countryContext: z.nullable(z.string().check(z.length(2))),
    lean: z.nullable(publisherLeanSchema),
    // Missing = sourced. Only meaningful with a lean.
    leanBasis: z.optional(z.nullable(leanBasisSchema)),
    leanEvidenceUrl: z.nullable(z.url()),
    leanNote: z.nullable(z.string().check(z.trim(), z.maxLength(500))),
  })
  .check(
    z.refine((r) => r.lean === null || r.leanEvidenceUrl !== null, {
      message: 'A lean needs a cited source',
      path: ['leanEvidenceUrl'],
    }),
    z.refine((r) => r.lean !== null || !r.leanBasis, {
      message: 'A lean basis needs a lean',
      path: ['leanBasis'],
    }),
  )
export type AssessmentRequest = z.infer<typeof assessmentRequestSchema>

export const evidenceResponseSchema = z.object({
  evidence: z.array(
    z.extend(assessmentEvidenceSchema, {
      retrievedAt: z.string(),
      // Hand-checked lean evidence only: the rating on our steps and its country.
      lean: z.nullable(publisherLeanSchema),
      countryContext: z.nullable(z.string()),
    }),
  ),
})
export type EvidenceResponse = z.infer<typeof evidenceResponseSchema>

export const publisherDetailSchema = z.extend(publisherStatsSchema, {
  profile: coverageProfileSchema,
  assessment: z.nullable(publisherAssessmentSchema),
  languages: z.array(z.string()),
  policyNote: z.nullable(z.string()),
  policyReviewedAt: z.nullable(z.string()),
  recentStories: z.array(storyListItemSchema),
  coCoverage: z.array(
    z.object({ publisher: publisherRefSchema, sharedStories: z.int().check(z.nonnegative()) }),
  ),
})
export type PublisherDetail = z.infer<typeof publisherDetailSchema>

export const userPreferencesSchema = z.object({
  // For You picks. Empty = no preference. They rank Stories up, never hide others.
  regions: z.array(regionSchema).check(z.maxLength(REGIONS.length)),
  desks: z.array(deskSchema).check(z.maxLength(DESKS.length)),
  topics: z.array(topicSchema).check(z.maxLength(TOPICS.length)),
  rememberReads: z.boolean(),
  // ISO 3166-1 alpha-2. Picks which country's lean mix a Story shows first.
  // Null = use the country the request comes from.
  country: z.nullable(z.string().check(z.regex(/^[A-Z]{2}$/))),
  // Explicit Local-page preference. Null means the request country may be used without storage.
  locality: z.nullable(placeSchema),
  // True once the reader has finished or skipped onboarding. Only ever set to true.
  onboarded: z.boolean(),
})
export type UserPreferences = z.infer<typeof userPreferencesSchema>

// Saves only the fields sent, so one setting can change without resending the rest.
export const userPreferencesUpdateSchema = z.partial(userPreferencesSchema)
export type UserPreferencesUpdate = z.infer<typeof userPreferencesUpdateSchema>

export const mutedPublisherSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
})
export type MutedPublisher = z.infer<typeof mutedPublisherSchema>

export const mutedPublisherListSchema = z.object({ items: z.array(mutedPublisherSchema) })
export type MutedPublisherList = z.infer<typeof mutedPublisherListSchema>

export const mutedPublisherRequestSchema = z.object({
  publisherId: z.string().check(z.minLength(1)),
  muted: z.boolean(),
})
export type MutedPublisherRequest = z.infer<typeof mutedPublisherRequestSchema>

export const readRequestSchema = z.object({ storyId: z.string().check(z.minLength(1)) })

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
  targetId: z.string().check(z.minLength(1)),
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
      feedback: z.nullable(feedbackSignalSchema),
    }),
  ),
  pageInfo: pageInfoSchema,
})
export type ForYouResponse = z.infer<typeof forYouResponseSchema>

export const briefingSectionKindSchema = z.enum(['essential', 'following', 'for_you', 'outside'])
export type BriefingSectionKind = z.infer<typeof briefingSectionKindSchema>

export const briefingSectionSchema = z.object({
  kind: briefingSectionKindSchema,
  title: z.string(),
  description: z.string(),
  items: z.array(
    z.object({
      story: storyListItemSchema,
      reasons: z.array(forYouReasonSchema),
      feedback: z.nullable(feedbackSignalSchema),
      // Separate from personal ranking reasons: this is the observable Story change.
      update: z.nullable(z.object({ kind: storyUpdateKindSchema, description: z.string() })),
    }),
  ),
})

export const briefingResponseSchema = z.object({
  // Null on the reader's first visit. Subsequent requests compare against this checkpoint.
  since: z.nullable(z.string()),
  openedAt: z.string(),
  personalised: z.boolean(),
  sections: z.array(briefingSectionSchema),
})
export type BriefingResponse = z.infer<typeof briefingResponseSchema>

export const signalKindSchema = z.enum(['topic', 'desk', 'region', 'narrative'])
export type SignalKind = z.infer<typeof signalKindSchema>

// null clears the tap and reverses what it applied (undo).
export const feedbackRequestSchema = z.object({
  storyId: z.string().check(z.minLength(1)),
  signal: z.nullable(feedbackSignalSchema),
})
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>

export const pushSubscriptionRequestSchema = z.object({
  token: z.string().check(z.regex(/^(?:Exponent|Expo)PushToken\[[^\]]+\]$/)),
})
export type PushSubscriptionRequest = z.infer<typeof pushSubscriptionRequestSchema>

export const pushSubscriptionStatusSchema = z.object({ registered: z.boolean() })
export type PushSubscriptionStatus = z.infer<typeof pushSubscriptionStatusSchema>

export const hiddenStoriesSchema = z.object({ items: z.array(storyListItemSchema) })
export type HiddenStories = z.infer<typeof hiddenStoriesSchema>

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
  readCount: z.int().check(z.nonnegative()),
  // Narratives you read in that have newer Stories you haven't opened.
  missedDevelopments: z.array(
    z.object({ narrative: narrativeRefSchema, stories: z.array(storyListItemSchema) }),
  ),
  // Regions and desks with many Stories this week that you barely read.
  gaps: z.array(
    z.object({
      kind: z.enum(['region', 'desk']),
      key: deskOrRegion,
      storiesThisWeek: z.int().check(z.nonnegative()),
      yourReads: z.int().check(z.nonnegative()),
    }),
  ),
  // Recent Stories that one side of the reader's country barely covers. Shown even with
  // reading history off: it is about coverage, not about the reader.
  oneSided: z.object({
    country: z.nullable(z.string()),
    stories: z.array(z.object({ story: storyListItemSchema, lean: storyLeanSchema })),
  }),
})
export type Insights = z.infer<typeof insightsSchema>

// A Narrative's Stories as a list of steps, oldest first (front page Developing band).
export const narrativeStepSchema = z.object({
  storyId: z.string(),
  slug: z.string(),
  title: z.string(),
  firstObservedAt: z.string(),
  // Typed link to an earlier Story in the same Narrative.
  relation: z.nullable(z.object({ type: storyRelationSchema, title: z.string(), at: z.string() })),
  // When a later Story corrected this one.
  correctedAt: z.nullable(z.string()),
})
export type NarrativeStep = z.infer<typeof narrativeStepSchema>

export const developingNarrativeSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  desk: z.nullable(deskSchema),
  storyCount: z.int().check(z.nonnegative()),
  since: z.string(),
  updatedAt: z.string(),
  steps: z.array(narrativeStepSchema),
})
export type DevelopingNarrative = z.infer<typeof developingNarrativeSchema>

// The header strip: edition time and the last 24 hours' counts.
export const editionSchema = z.object({
  editionAt: z.string(),
  stats: z.object({
    stories: z.int().check(z.nonnegative()),
    publishers: z.int().check(z.nonnegative()),
  }),
})
export type Edition = z.infer<typeof editionSchema>

// Everything above the Latest grid: strip stats, lead Story and the Developing band.
export const frontPageSchema = z.object({
  ...editionSchema.shape,
  lead: z.nullable(storyLeadSchema),
  // "Story 3 of 6" within the lead's Narrative.
  leadPosition: z.nullable(z.object({ index: z.int().check(z.positive()), total: z.int() })),
  developing: z.array(developingNarrativeSchema),
  narrativeCount: z.int().check(z.nonnegative()),
})
export type FrontPage = z.infer<typeof frontPageSchema>
