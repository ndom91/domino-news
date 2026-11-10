import type {
  AudioBriefingStyle,
  NarrativeTitle,
  RelationshipCandidate,
  StoryChoice,
  StoryContextOutput,
  StorySummaryOutput,
  SummaryUpdateAssessment,
} from '@dn/schemas'

/** Publisher-controlled text. Always treated as untrusted data, never as instructions. */
export interface ArticleInput {
  articleId: string
  observationId: string
  publisher: string
  /** Publisher's home country. Not sent to models; fixture inference derives regions from it. */
  publisherCountry?: string | null
  /** "official" = government, court, regulator or IGO; its articles are statements, not reporting. */
  publisherKind?: 'newsroom' | 'official'
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

export interface SummaryUpdateInput {
  storyId: string
  previousSummary: string
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
  writeAudioBriefing(input: {
    stories: { title: string; summary: string | null }[]
    greeting: { name: string; date: string }
    style: AudioBriefingStyle
    signal: AbortSignal
  }): Promise<string>
  /** One call with several candidates side by side: which one, if any, is the same development. */
  chooseStory(input: {
    article: ArticleInput
    stories: StoryInput[]
  }): Promise<Generated<StoryChoice>>
  summarizeStory(input: { story: StoryInput }): Promise<Generated<StorySummaryOutput>>
  assessSummaryUpdate(input: {
    update: SummaryUpdateInput
  }): Promise<Generated<SummaryUpdateAssessment>>
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

/** A bounded-choice model used to accept only high-confidence Story matches. */
export interface StoryChoiceDecisionProvider {
  readonly modelId: string
  chooseStory(input: {
    article: ArticleInput
    stories: StoryInput[]
  }): Promise<Generated<StoryChoice & { confidence: number }>>
}

export interface InferenceProviders {
  mode: 'fixture' | 'local'
  embeddings: EmbeddingProvider
  generation: GenerationProvider
  decision?: StoryChoiceDecisionProvider
}

/** Endpoint unreachable, timed out or returned 5xx. Retry later; nothing was produced. */
export class InferenceUnavailableError extends Error {
  override name = 'InferenceUnavailableError'
}

/** The model answered but the output failed schema validation. */
export class InvalidModelOutputError extends Error {
  override name = 'InvalidModelOutputError'
}
