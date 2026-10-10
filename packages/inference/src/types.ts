import type {
  NarrativeTitle,
  RelationshipCandidate,
  StoryContextOutput,
  StoryMatch,
  StorySummaryOutput,
} from '@dn/schemas'

/** Publisher-controlled text. Always treated as untrusted data, never as instructions. */
export interface ArticleInput {
  articleId: string
  observationId: string
  publisher: string
  title: string
  description: string | null
  publishedAt: string | null
  /** Transient body, only when publisher policy allows. Never persisted or logged. */
  body?: string
}

export interface StoryInput {
  storyId: string
  title: string
  summary: string | null
  firstObservedAt: string
  articles: ArticleInput[]
}

export interface Generated<T> {
  output: T
  modelId: string
  promptVersion: string
}

export interface EmbeddingProvider {
  readonly modelId: string
  embedDocuments(docs: { title: string; text: string }[]): Promise<number[][]>
  embedQuery(query: string): Promise<number[]>
}

export interface GenerationProvider {
  readonly modelId: string
  matchStory(input: { article: ArticleInput; story: StoryInput }): Promise<Generated<StoryMatch>>
  summarizeStory(input: { story: StoryInput }): Promise<Generated<StorySummaryOutput>>
  classifyRelationship(input: {
    newer: StoryInput
    older: StoryInput
  }): Promise<Generated<RelationshipCandidate>>
  titleNarrative(input: { stories: StoryInput[] }): Promise<Generated<NarrativeTitle>>
  explainContext(input: {
    story: StoryInput
    summary: string
  }): Promise<Generated<StoryContextOutput>>
}

export interface InferenceProviders {
  mode: 'fixture' | 'local'
  embeddings: EmbeddingProvider
  generation: GenerationProvider
}

/** Endpoint unreachable, timed out or returned 5xx. Retry later; nothing was produced. */
export class InferenceUnavailableError extends Error {
  override name = 'InferenceUnavailableError'
}

/** The model answered but the output failed schema validation. */
export class InvalidModelOutputError extends Error {
  override name = 'InvalidModelOutputError'
}
