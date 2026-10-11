import { type Desk, EMBEDDING_DIMENSIONS, type Region } from '@dn/schemas'
import { sql } from 'drizzle-orm'
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core'

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const createdAt = () => ts('created_at').notNull().defaultNow()

export const articleBodyPolicy = pgEnum('article_body_policy', [
  'metadata_only',
  'transient_body_allowed',
])

// "official" = government, court, regulator or IGO. Shown as such and excluded from
// outlet coverage stats so a press release never "beats" newsrooms.
export const publisherKind = pgEnum('publisher_kind', ['newsroom', 'official'])

export const observationType = pgEnum('observation_type', [
  'article_discovered',
  'article_revision_detected',
  'source_citation_found',
  'primary_document_found',
  'correction_notice_found',
  'publisher_statement_found',
])

export const storyStatus = pgEnum('story_status', ['developing', 'ongoing', 'dormant'])

export const storyRelation = pgEnum('story_relation', [
  'follows',
  'branches_from',
  'responds_to',
  'corrects',
  'provides_context_for',
  'related_to',
])

export const sourceReferenceKind = pgEnum('source_reference_kind', [
  'publisher_article',
  'primary_document',
  'dataset',
  'official_statement',
  'other',
])

export const analysisRunStatus = pgEnum('analysis_run_status', ['running', 'succeeded', 'failed'])

export const evidenceRelationship = pgEnum('evidence_relationship', [
  'derived_from',
  'supports',
  'contradicts',
  'context',
])

export const summaryFormat = pgEnum('summary_format', ['paragraph', 'bullets'])

export const claimStance = pgEnum('claim_stance', ['asserts', 'denies', 'quotes', 'discusses'])

export const claimEvidenceRelation = pgEnum('claim_evidence_relation', [
  'supports',
  'contradicts',
  'context',
  'inconclusive',
])

export const contextKind = pgEnum('context_kind', ['definition', 'background', 'prerequisite'])

// Sources and ingest

export const publisher = pgTable('publisher', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  domain: text('domain').notNull().unique(),
  countryCode: text('country_code'),
  languages: text('languages').array().notNull().default(sql`'{}'::text[]`),
  // Conservative default. Only verified permissions should switch this.
  articleBodyPolicy: articleBodyPolicy('article_body_policy').notNull().default('metadata_only'),
  kind: publisherKind('kind').notNull().default('newsroom'),
  // Licence the body policy relies on, e.g. "CC-BY-ND-4.0", "public-domain".
  license: text('license'),
  policyNote: text('policy_note'),
  policyReviewedAt: ts('policy_reviewed_at'),
  createdAt: createdAt(),
})

export const feed = pgTable('feed', {
  id: text('id').primaryKey(),
  publisherId: text('publisher_id')
    .notNull()
    .references(() => publisher.id),
  url: text('url').notNull().unique(),
  title: text('title'),
  enabled: boolean('enabled').notNull().default(true),
  lastPolledAt: ts('last_polled_at'),
  lastStatus: text('last_status'),
  lastError: text('last_error'),
  etag: text('etag'),
  lastModified: text('last_modified'),
  createdAt: createdAt(),
})

export const article = pgTable(
  'article',
  {
    id: text('id').primaryKey(),
    publisherId: text('publisher_id')
      .notNull()
      .references(() => publisher.id),
    canonicalUrl: text('canonical_url').notNull().unique(),
    firstSeenAt: ts('first_seen_at').notNull(),
    publishedAt: ts('published_at'),
    latestRevisionId: text('latest_revision_id'),
    // Pipeline bookkeeping, not domain truth.
    pipelineState: text('pipeline_state').notNull().default('discovered'),
  },
  (t) => [
    index('article_published_at_idx').on(t.publishedAt),
    index('article_pipeline_state_idx').on(t.pipelineState),
  ],
)

export const articleRevision = pgTable(
  'article_revision',
  {
    id: text('id').primaryKey(),
    articleId: text('article_id')
      .notNull()
      .references(() => article.id),
    observedAt: ts('observed_at').notNull(),
    reportedUpdatedAt: ts('reported_updated_at'),
    title: text('title').notNull(),
    description: text('description'),
    contentHash: text('content_hash').notNull(),
    previousRevisionId: text('previous_revision_id'),
  },
  (t) => [index('article_revision_article_idx').on(t.articleId, t.observedAt)],
)

export const feedEntry = pgTable(
  'feed_entry',
  {
    id: text('id').primaryKey(),
    feedId: text('feed_id')
      .notNull()
      .references(() => feed.id),
    articleId: text('article_id')
      .notNull()
      .references(() => article.id),
    externalGuid: text('external_guid'),
    firstSeenAt: ts('first_seen_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull(),
  },
  (t) => [uniqueIndex('feed_entry_feed_article_uq').on(t.feedId, t.articleId)],
)

export const articleEmbedding = pgTable('article_embedding', {
  articleId: text('article_id')
    .primaryKey()
    .references(() => article.id),
  revisionId: text('revision_id').notNull(),
  modelId: text('model_id').notNull(),
  inputFingerprint: text('input_fingerprint').notNull(),
  embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  createdAt: createdAt(),
})

// Observations (immutable, enforced by trigger in migration)

export const observation = pgTable(
  'observation',
  {
    id: text('id').primaryKey(),
    type: observationType('type').notNull(),
    observedAt: ts('observed_at').notNull(),
    sourcePublishedAt: ts('source_published_at'),
    sourceUrl: text('source_url').notNull(),
    collectionMethod: text('collection_method').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    schemaVersion: integer('schema_version').notNull(),
  },
  (t) => [
    index('observation_subject_idx').on(t.subjectType, t.subjectId),
    index('observation_observed_at_idx').on(t.observedAt),
  ],
)

// Analysis provenance

export const analysisRun = pgTable(
  'analysis_run',
  {
    id: text('id').primaryKey(),
    operation: text('operation').notNull(),
    modelId: text('model_id').notNull(),
    promptVersion: text('prompt_version').notNull(),
    pipelineVersion: text('pipeline_version').notNull(),
    inputFingerprint: text('input_fingerprint').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    startedAt: ts('started_at').notNull(),
    completedAt: ts('completed_at'),
    status: analysisRunStatus('status').notNull(),
    error: text('error'),
  },
  (t) => [
    index('analysis_run_target_idx').on(t.targetType, t.targetId),
    index('analysis_run_started_idx').on(t.startedAt),
  ],
)

export const interpretation = pgTable(
  'interpretation',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    subjectType: text('subject_type').notNull(),
    subjectId: text('subject_id').notNull(),
    output: jsonb('output').$type<Record<string, unknown>>().notNull(),
    analysisRunId: text('analysis_run_id')
      .notNull()
      .references(() => analysisRun.id),
    createdAt: createdAt(),
    supersedesInterpretationId: text('supersedes_interpretation_id'),
  },
  (t) => [index('interpretation_subject_idx').on(t.subjectType, t.subjectId)],
)

export const interpretationEvidence = pgTable(
  'interpretation_evidence',
  {
    interpretationId: text('interpretation_id')
      .notNull()
      .references(() => interpretation.id),
    observationId: text('observation_id')
      .notNull()
      .references(() => observation.id),
    relationship: evidenceRelationship('relationship').notNull(),
  },
  (t) => [primaryKey({ columns: [t.interpretationId, t.observationId] })],
)

// Publisher assessments. Evidence is imported from open sources (Wikidata, Wikipedia's
// perennial sources list) and refreshed on every import. An assessment is a reviewed,
// append-only snapshot: a new review is a new row, and it freezes the evidence it used.

export const publisherEvidence = pgTable(
  'publisher_evidence',
  {
    id: text('id').primaryKey(),
    publisherId: text('publisher_id')
      .notNull()
      .references(() => publisher.id, { onDelete: 'cascade' }),
    source: text('source').$type<'wikidata' | 'wp_rsp'>().notNull(),
    dimension: text('dimension').$type<'ownership' | 'reliability' | 'lean'>().notNull(),
    value: text('value').notNull(),
    url: text('url').notNull(),
    retrievedAt: ts('retrieved_at').notNull(),
  },
  (t) => [index('publisher_evidence_publisher_idx').on(t.publisherId)],
)

export const publisherLean = pgEnum('publisher_lean', [
  'left',
  'centre_left',
  'centre',
  'centre_right',
  'right',
])

export const publisherFundingModel = pgEnum('publisher_funding_model', [
  'public_broadcaster',
  'state',
  'commercial',
  'nonprofit',
  'other',
])

// Ordinal, best to worst. Mirrors Wikipedia's perennial-sources labels, folded to four steps.
export const publisherReliability = pgEnum('publisher_reliability', [
  'reliable',
  'no_consensus',
  'unreliable',
  'deprecated',
])

export const publisherAssessment = pgTable(
  'publisher_assessment',
  {
    id: text('id').primaryKey(),
    publisherId: text('publisher_id')
      .notNull()
      .references(() => publisher.id, { onDelete: 'cascade' }),
    methodologyVersion: text('methodology_version').notNull(),
    // Lean is relative to this country's media, never one global axis.
    countryContext: text('country_context'),
    // Null on assessments made before these fields existed, or when not rated.
    fundingModel: publisherFundingModel('funding_model'),
    ownership: text('ownership').notNull(),
    reliabilityLevel: publisherReliability('reliability_level'),
    reliability: text('reliability').notNull(),
    // Null = not assessed. When set, it must cite evidence (e.g. Reuters audience data).
    lean: publisherLean('lean'),
    leanEvidenceUrl: text('lean_evidence_url'),
    leanNote: text('lean_note'),
    evidence: jsonb('evidence')
      .$type<{ source: string; dimension: string; value: string; url: string }[]>()
      .notNull(),
    reviewedBy: text('reviewed_by')
      .notNull()
      .references(() => authUser.id),
    reviewedAt: ts('reviewed_at').notNull().defaultNow(),
  },
  (t) => [
    index('publisher_assessment_publisher_idx').on(t.publisherId, t.reviewedAt),
    check(
      'publisher_assessment_lean_cited',
      sql`${t.lean} is null or ${t.leanEvidenceUrl} is not null`,
    ),
  ],
)

// Stories, graph and narratives

export const story = pgTable(
  'story',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    status: storyStatus('status').notNull().default('developing'),
    createdAt: createdAt(),
    firstObservedAt: ts('first_observed_at').notNull(),
    lastUpdatedAt: ts('last_updated_at').notNull(),
    // Null until published; publishing requires >= 1 active StoryArticle (trigger + service).
    publishedAt: ts('published_at'),
    currentSummaryId: text('current_summary_id'),
    // Fingerprint of the active article revisions; summaries for other inputs are stale.
    inputFingerprint: text('input_fingerprint'),
    // Monotonic aggregate version for outbox/search ordering.
    version: integer('version').notNull().default(1),
    mergedIntoStoryId: text('merged_into_story_id'),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }),
    // Macro-regions the Story concerns (`REGIONS` in @dn/schemas), set by generated summaries.
    regions: text('regions').array().$type<Region[]>().notNull().default(sql`'{}'::text[]`),
    // Desk (`DESKS` in @dn/schemas), set by generated summaries; null until then.
    desk: text('desk').$type<Desk>(),
  },
  (t) => [
    index('story_published_idx').on(t.publishedAt),
    index('story_last_updated_idx').on(t.lastUpdatedAt),
    index('story_regions_idx').using('gin', t.regions),
  ],
)

export const storyArticle = pgTable(
  'story_article',
  {
    id: text('id').primaryKey(),
    storyId: text('story_id')
      .notNull()
      .references(() => story.id),
    articleId: text('article_id')
      .notNull()
      .references(() => article.id),
    addedAt: ts('added_at').notNull(),
    removedAt: ts('removed_at'),
    confidence: real('confidence'),
    analysisRunId: text('analysis_run_id').references(() => analysisRun.id),
    matchMethod: text('match_method').notNull(),
  },
  (t) => [
    index('story_article_story_idx').on(t.storyId),
    // An article belongs to at most one active Story.
    uniqueIndex('story_article_active_article_uq')
      .on(t.articleId)
      .where(sql`${t.removedAt} is null`),
  ],
)

export const storyRelationship = pgTable(
  'story_relationship',
  {
    id: text('id').primaryKey(),
    fromStoryId: text('from_story_id')
      .notNull()
      .references(() => story.id),
    toStoryId: text('to_story_id')
      .notNull()
      .references(() => story.id),
    relation: storyRelation('relation').notNull(),
    createdAt: createdAt(),
    supersededAt: ts('superseded_at'),
    analysisRunId: text('analysis_run_id').references(() => analysisRun.id),
    confidence: real('confidence'),
  },
  (t) => [
    check('story_relationship_no_self', sql`${t.fromStoryId} <> ${t.toStoryId}`),
    uniqueIndex('story_relationship_active_uq')
      .on(t.fromStoryId, t.toStoryId)
      .where(sql`${t.supersededAt} is null`),
    index('story_relationship_to_idx').on(t.toStoryId),
  ],
)

export const storyLineageEvent = pgTable('story_lineage_event', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  fromStoryIds: text('from_story_ids').array().notNull(),
  toStoryIds: text('to_story_ids').array().notNull(),
  occurredAt: ts('occurred_at').notNull(),
  reason: text('reason'),
  analysisRunId: text('analysis_run_id').references(() => analysisRun.id),
})

// Old slugs/IDs keep resolving after merges or retitles.
export const storyAlias = pgTable('story_alias', {
  alias: text('alias').primaryKey(),
  storyId: text('story_id')
    .notNull()
    .references(() => story.id),
  createdAt: createdAt(),
})

export const narrative = pgTable('narrative', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description'),
  createdAt: createdAt(),
  updatedAt: ts('updated_at').notNull(),
  version: integer('version').notNull().default(1),
  titleInterpretationId: text('title_interpretation_id'),
})

export const narrativeStory = pgTable(
  'narrative_story',
  {
    narrativeId: text('narrative_id')
      .notNull()
      .references(() => narrative.id),
    storyId: text('story_id')
      .notNull()
      .references(() => story.id),
    addedAt: ts('added_at').notNull(),
    removedAt: ts('removed_at'),
  },
  (t) => [
    primaryKey({ columns: [t.narrativeId, t.storyId] }),
    index('narrative_story_story_idx').on(t.storyId),
  ],
)

// Summary versions are immutable (trigger); edits create a new superseding version.
export const storySummaryVersion = pgTable(
  'story_summary_version',
  {
    id: text('id').primaryKey(),
    storyId: text('story_id')
      .notNull()
      .references(() => story.id),
    interpretationId: text('interpretation_id').references(() => interpretation.id),
    headline: text('headline').notNull(),
    body: text('body').notNull(),
    format: summaryFormat('format').notNull().default('paragraph'),
    createdAt: createdAt(),
    supersedesVersionId: text('supersedes_version_id'),
    editedByUserId: text('edited_by_user_id'),
    inputFingerprint: text('input_fingerprint'),
  },
  (t) => [index('story_summary_version_story_idx').on(t.storyId, t.createdAt)],
)

export const storySummarySource = pgTable(
  'story_summary_source',
  {
    summaryVersionId: text('summary_version_id')
      .notNull()
      .references(() => storySummaryVersion.id),
    articleId: text('article_id')
      .notNull()
      .references(() => article.id),
    // Display number used by `[n]` markers in the summary body (publishing order of cited sources).
    citation: integer('citation'),
  },
  (t) => [primaryKey({ columns: [t.summaryVersionId, t.articleId] })],
)

export const sourceReference = pgTable('source_reference', {
  id: text('id').primaryKey(),
  url: text('url').notNull().unique(),
  title: text('title'),
  kind: sourceReferenceKind('kind').notNull(),
  discoveredAt: ts('discovered_at').notNull(),
})

export const storySourceReference = pgTable(
  'story_source_reference',
  {
    storyId: text('story_id')
      .notNull()
      .references(() => story.id),
    sourceReferenceId: text('source_reference_id')
      .notNull()
      .references(() => sourceReference.id),
    observationId: text('observation_id').references(() => observation.id),
    addedAt: ts('added_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.sourceReferenceId] })],
)

// Context entries: reusable background explanations shown as popovers on Story summaries.
// Explanations are versioned (append-only trigger); entries are shared across Stories.

export const contextEntry = pgTable('context_entry', {
  id: text('id').primaryKey(),
  kind: contextKind('kind').notNull(),
  title: text('title').notNull(),
  // Lowercased slug of the title; the same subject is explained once and reused.
  normalizedKey: text('normalized_key').notNull().unique(),
  currentVersionId: text('current_version_id'),
  createdAt: createdAt(),
})

export const contextEntryVersion = pgTable(
  'context_entry_version',
  {
    id: text('id').primaryKey(),
    contextEntryId: text('context_entry_id')
      .notNull()
      .references(() => contextEntry.id),
    explanation: text('explanation').notNull(),
    interpretationId: text('interpretation_id')
      .notNull()
      .references(() => interpretation.id),
    createdAt: createdAt(),
  },
  (t) => [index('context_entry_version_entry_idx').on(t.contextEntryId)],
)

// Which entries annotate which Story summary, and the exact text they anchor to.
export const storyContext = pgTable(
  'story_context',
  {
    storyId: text('story_id')
      .notNull()
      .references(() => story.id),
    contextEntryId: text('context_entry_id')
      .notNull()
      .references(() => contextEntry.id),
    anchorText: text('anchor_text').notNull(),
    interpretationId: text('interpretation_id')
      .notNull()
      .references(() => interpretation.id),
    addedAt: ts('added_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.storyId, t.contextEntryId] })],
)

// Claims (lite): statements made in a Story's coverage and which outlets make them.
// A claim is an interpretation, not a verified fact. Re-extraction supersedes, never edits.

export const claim = pgTable(
  'claim',
  {
    id: text('id').primaryKey(),
    storyId: text('story_id')
      .notNull()
      .references(() => story.id),
    proposition: text('proposition').notNull(),
    interpretationId: text('interpretation_id')
      .notNull()
      .references(() => interpretation.id),
    // Summary version the extraction was based on.
    summaryVersionId: text('summary_version_id').notNull(),
    createdAt: createdAt(),
    supersededAt: ts('superseded_at'),
  },
  (t) => [index('claim_story_idx').on(t.storyId)],
)

export const claimMention = pgTable(
  'claim_mention',
  {
    claimId: text('claim_id')
      .notNull()
      .references(() => claim.id),
    articleId: text('article_id')
      .notNull()
      .references(() => article.id),
    articleRevisionId: text('article_revision_id').notNull(),
    observationId: text('observation_id')
      .notNull()
      .references(() => observation.id),
    stance: claimStance('stance').notNull(),
    analysisRunId: text('analysis_run_id')
      .notNull()
      .references(() => analysisRun.id),
  },
  (t) => [primaryKey({ columns: [t.claimId, t.articleId] })],
)

export const claimEvidence = pgTable(
  'claim_evidence',
  {
    claimId: text('claim_id')
      .notNull()
      .references(() => claim.id),
    sourceReferenceId: text('source_reference_id')
      .notNull()
      .references(() => sourceReference.id),
    relationship: claimEvidenceRelation('relationship').notNull(),
    analysisRunId: text('analysis_run_id')
      .notNull()
      .references(() => analysisRun.id),
  },
  (t) => [primaryKey({ columns: [t.claimId, t.sourceReferenceId] })],
)

// Outbox / inbox / search projection state

export const outboxEvent = pgTable(
  'outbox_event',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    eventType: text('event_type').notNull(),
    aggregateVersion: integer('aggregate_version').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    processedAt: ts('processed_at'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: ts('next_attempt_at').notNull().defaultNow(),
    lastError: text('last_error'),
    deadAt: ts('dead_at'),
  },
  (t) => [
    index('outbox_pending_idx')
      .on(t.nextAttemptAt)
      .where(sql`${t.processedAt} is null and ${t.deadAt} is null`),
    index('outbox_dead_idx').on(t.id).where(sql`${t.deadAt} is not null`),
  ],
)

export const inboxEvent = pgTable(
  'inbox_event',
  {
    consumer: text('consumer').notNull(),
    eventId: text('event_id').notNull(),
    processedAt: ts('processed_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.consumer, t.eventId] })],
)

// Highest aggregate version applied to the search index; guards against out-of-order events.
export const searchProjectionState = pgTable(
  'search_projection_state',
  {
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    indexedVersion: integer('indexed_version').notNull(),
    deleted: boolean('deleted').notNull().default(false),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.aggregateType, t.aggregateId] })],
)

export const pipelineControl = pgTable('pipeline_control', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

// Auth (better-auth, username plugin). Table names mapped in the auth adapter.

export const authUser = pgTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  username: text('username').unique(),
  displayUsername: text('display_username'),
  // 'admin' | 'user'; admins can see the pipeline (/ops) and run its actions.
  role: text('role').notNull().default('user'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const authSession = pgTable('auth_session', {
  id: text('id').primaryKey(),
  expiresAt: ts('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
})

export const authAccount = pgTable('auth_account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: ts('access_token_expires_at'),
  refreshTokenExpiresAt: ts('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const authVerification = pgTable('auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: ts('expires_at').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

// Reader settings. Kept out of auth_user so better-auth owns that table's shape.
export const userPreference = pgTable('user_preference', {
  userId: text('user_id')
    .primaryKey()
    .references(() => authUser.id, { onDelete: 'cascade' }),
  // A region from `REGIONS` that boosts the feed; null = no preference.
  edition: text('edition').$type<Region>(),
  // Opt-in: record Story reads for the Blindspot page. Off = nothing is recorded.
  rememberReads: boolean('remember_reads').notNull().default(false),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

// One row per user and Story (latest read wins), kept for READ_RETENTION_DAYS. Only
// written while the user has opted in; insights are computed from it on request.
export const readingEvent = pgTable(
  'reading_event',
  {
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    storyId: text('story_id')
      .notNull()
      .references(() => story.id, { onDelete: 'cascade' }),
    readAt: ts('read_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.storyId] }),
    index('reading_event_read_at_idx').on(t.readAt),
  ],
)

// better-auth passkey plugin (WebAuthn credentials).
export const authPasskey = pgTable(
  'auth_passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUser.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull(),
    transports: text('transports'),
    aaguid: text('aaguid'),
    createdAt: ts('created_at'),
  },
  (t) => [
    index('auth_passkey_user_idx').on(t.userId),
    index('auth_passkey_credential_idx').on(t.credentialID),
  ],
)
