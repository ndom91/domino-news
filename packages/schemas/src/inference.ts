import { z } from 'zod'

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

export const storySummarySchema = z.object({
  headline: z.string().min(1).max(200),
  summary: z.string().min(1).max(2000),
  sourceArticleIds: z.array(z.string()).min(1),
  observationIds: z.array(z.string()).min(1),
})
export type StorySummaryOutput = z.infer<typeof storySummarySchema>

export const contextEntrySchema = z.object({
  title: z.string(),
  explanation: z.string(),
  sourceObservationIds: z.array(z.string()).min(1),
})
export type ContextEntryOutput = z.infer<typeof contextEntrySchema>

export const contextKindSchema = z.enum(['definition', 'background', 'prerequisite'])

// Context for one Story summary. `anchorText` must appear verbatim in the summary.
export const storyContextOutputSchema = z.object({
  entries: z
    .array(
      contextEntrySchema.extend({
        anchorText: z.string().min(2).max(80),
        kind: contextKindSchema,
      }),
    )
    .max(4),
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
  relation: storyRelationSchema.nullable(),
  rationale: z.string(),
})
export type RelationshipCandidate = z.infer<typeof relationshipCandidateSchema>

export const narrativeTitleSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(400),
})
export type NarrativeTitle = z.infer<typeof narrativeTitleSchema>

export const articleMetadataSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable(),
  canonicalUrl: z.url(),
  publishedAt: z.iso.datetime().nullable(),
  // Publisher-reported modification time (Atom <updated>, dc:modified), when present.
  updatedAt: z.iso.datetime().nullable(),
  externalGuid: z.string().nullable(),
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
  title: z.string().nullable(),
  kind: sourceReferenceKindSchema,
})
export type SourceReferenceCandidate = z.infer<typeof sourceReferenceCandidateSchema>
