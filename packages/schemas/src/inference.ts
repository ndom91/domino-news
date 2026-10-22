import { z } from 'zod/mini'
import { deskSchema } from './desks.ts'
import { regionSchema } from './regions.ts'
import { topicSchema } from './topics.ts'

// Vector size of EmbeddingGemma 2 (and the fixture adapter). Changing it needs a DB
// migration and a search-index rebuild.
export const EMBEDDING_DIMENSIONS = 768

// Structured-output contracts for local generation. Valid structure is necessary,
// not sufficient: callers must also check that referenced IDs exist and are linked.

export const storyMatchSchema = z.object({
  decision: z.enum(['same_development', 'related_development', 'unrelated', 'uncertain']),
  evidenceArticleIds: z.array(z.string()),
  rationale: z.string(),
})
export type StoryMatch = z.infer<typeof storyMatchSchema>

// Which of several candidate stories an article belongs to; null = none, start a new story.
export const storyChoiceSchema = z.object({
  storyId: z.nullable(z.string()),
  rationale: z.string(),
})
export type StoryChoice = z.infer<typeof storyChoiceSchema>

export const storySummarySchema = z.object({
  headline: z.string().check(z.minLength(1), z.maxLength(200)),
  summary: z.string().check(z.minLength(1), z.maxLength(2000)),
  // 2-3 more paragraphs for the Story page; the summary alone goes on cards.
  detail: z.string().check(z.minLength(1), z.maxLength(4000)),
  sourceArticleIds: z.array(z.string()).check(z.minLength(1)),
  observationIds: z.array(z.string()).check(z.minLength(1)),
  regions: z.array(regionSchema).check(z.minLength(1), z.maxLength(3)),
  desk: deskSchema,
  topics: z.array(topicSchema).check(z.maxLength(3)),
})
export type StorySummaryOutput = z.infer<typeof storySummarySchema>

// Decides whether newly attached reporting warrants replacing a published Story summary.
export const summaryUpdateAssessmentSchema = z.object({
  changeKind: z.nullable(
    z.enum([
      'new_fact',
      'status_change',
      'official_response',
      'consequence',
      'correction',
      'new_perspective',
    ]),
  ),
  outcome: z.enum(['material', 'corroboration_only', 'uncertain']),
  note: z.string().check(z.maxLength(300)),
  sourceArticleIds: z.array(z.string()),
  observationIds: z.array(z.string()),
})
export type SummaryUpdateAssessment = z.infer<typeof summaryUpdateAssessmentSchema>

export const contextEntrySchema = z.object({
  title: z.string(),
  explanation: z.string(),
  sourceObservationIds: z.array(z.string()).check(z.minLength(1)),
})
export type ContextEntryOutput = z.infer<typeof contextEntrySchema>

export const contextKindSchema = z.enum(['definition', 'background', 'prerequisite'])

// Context for one Story summary. `anchorText` must appear verbatim in the summary.
export const storyContextOutputSchema = z.object({
  entries: z
    .array(
      z.extend(contextEntrySchema, {
        anchorText: z.string().check(z.minLength(2), z.maxLength(80)),
        kind: contextKindSchema,
      }),
    )
    .check(z.maxLength(6)),
})
export type StoryContextOutput = z.infer<typeof storyContextOutputSchema>

export const storyRelationValues = [
  'follows',
  'branches_from',
  'responds_to',
  'corrects',
  'provides_context_for',
  'related_to',
] as const
export const storyRelationSchema = z.enum(storyRelationValues)
export type StoryRelation = z.infer<typeof storyRelationSchema>

// The newer Story is always `from`; the established Story is `to`.
export const relationshipCandidateSchema = z.object({
  decision: z.enum(['related', 'unrelated', 'uncertain']),
  relation: z.nullable(storyRelationSchema),
  rationale: z.string(),
})
export type RelationshipCandidate = z.infer<typeof relationshipCandidateSchema>

export const narrativeTitleSchema = z.object({
  title: z.string().check(z.minLength(1), z.maxLength(120)),
  description: z.string().check(z.maxLength(400)),
})
export type NarrativeTitle = z.infer<typeof narrativeTitleSchema>

export const articleMetadataSchema = z.object({
  title: z.string().check(z.minLength(1)),
  description: z.nullable(z.string()),
  canonicalUrl: z.url(),
  publishedAt: z.nullable(z.iso.datetime()),
  // Publisher-reported modification time (Atom <updated>, dc:modified), when present.
  updatedAt: z.nullable(z.iso.datetime()),
  externalGuid: z.nullable(z.string()),
})
export type ArticleMetadata = z.infer<typeof articleMetadataSchema>

export const sourceReferenceKindSchema = z.enum([
  'publisher_article',
  'primary_document',
  'dataset',
  'official_statement',
  'other',
])

export const sourceReferenceCandidateSchema = z.object({
  url: z.url(),
  title: z.nullable(z.string()),
  kind: sourceReferenceKindSchema,
})
export type SourceReferenceCandidate = z.infer<typeof sourceReferenceCandidateSchema>

export const claimStanceSchema = z.enum(['asserts', 'denies', 'quotes', 'discusses'])
export const claimEvidenceRelationSchema = z.enum([
  'supports',
  'contradicts',
  'context',
  'inconclusive',
])

// Claims made in a Story's coverage. Ids must refer to this Story's articles/primary sources.
export const claimsOutputSchema = z.object({
  claims: z
    .array(
      z.object({
        proposition: z.string().check(z.minLength(8), z.maxLength(300)),
        mentions: z
          .array(z.object({ articleId: z.string(), stance: claimStanceSchema }))
          .check(z.minLength(1)),
        evidence: z.array(
          z.object({ sourceReferenceId: z.string(), relationship: claimEvidenceRelationSchema }),
        ),
      }),
    )
    .check(z.maxLength(5)),
})
export type ClaimsOutput = z.infer<typeof claimsOutputSchema>
