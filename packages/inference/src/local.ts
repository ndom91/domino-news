import {
  claimEvidenceRelationSchema,
  claimStanceSchema,
  contextKindSchema,
  narrativeTitleSchema,
  relationshipCandidateSchema,
  storyMatchSchema,
  storySummarySchema,
  summaryUpdateAssessmentSchema,
} from '@dn/schemas'
import { z } from 'zod/mini'
import {
  assessSummaryUpdatePrompt,
  chooseStoryPrompt,
  classifyRelationshipPrompt,
  explainContextPrompt,
  extractClaimsPrompt,
  matchStoryPrompt,
  PROMPT_VERSIONS,
  SYSTEM_PROMPT,
  summarizeStoryPrompt,
  titleNarrativePrompt,
} from './prompts.ts'
import {
  type EmbeddingProvider,
  type GenerationProvider,
  InferenceUnavailableError,
  InvalidModelOutputError,
} from './types.ts'

export interface LocalConfig {
  baseUrl: string
  apiKey?: string
  embeddingModel: string
  generationModel: string
}

const EMBED_BATCH_SIZE = 16
// Short in-call retries smooth over brief gateway blips; longer outages fall
// through to the job queue's backoff.
const TRANSIENT_RETRY_DELAYS_MS = [400, 1500]

async function post(config: LocalConfig, path: string, body: unknown, timeoutMs: number) {
  for (const delay of TRANSIENT_RETRY_DELAYS_MS) {
    try {
      return await postOnce(config, path, body, timeoutMs)
    } catch (error) {
      if (!(error instanceof InferenceUnavailableError)) throw error
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  return postOnce(config, path, body, timeoutMs)
}

async function postOnce(config: LocalConfig, path: string, body: unknown, timeoutMs: number) {
  let res: Response
  try {
    res = await fetch(`${config.baseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    // Deliberately omit the request body: it may contain transient article text.
    throw new InferenceUnavailableError(`inference request to ${path} failed: ${String(error)}`)
  }
  if (res.status >= 500 || res.status === 429) {
    throw new InferenceUnavailableError(`inference ${path} returned ${res.status}`)
  }
  if (!res.ok) throw new Error(`inference ${path} returned ${res.status}`)
  return res.json() as Promise<unknown>
}

const embeddingResponse = z.object({
  data: z.array(z.object({ index: z.number(), embedding: z.array(z.number()) })),
})

export function createLocalEmbeddings(config: LocalConfig): EmbeddingProvider {
  const embed = async (inputs: string[]) => {
    const out: number[][] = []
    for (let i = 0; i < inputs.length; i += EMBED_BATCH_SIZE) {
      const batch = inputs.slice(i, i + EMBED_BATCH_SIZE)
      const json = embeddingResponse.parse(
        await post(config, '/embeddings', { model: config.embeddingModel, input: batch }, 60_000),
      )
      const sorted = [...json.data].sort((a, b) => a.index - b.index)
      // A short or misindexed response would attach vectors to the wrong articles.
      if (sorted.length !== batch.length || sorted.some((d, j) => d.index !== j)) {
        throw new InvalidModelOutputError(
          `embeddings: expected ${batch.length} vectors, got ${sorted.length}`,
        )
      }
      out.push(...sorted.map((d) => d.embedding))
    }
    return out
  }
  return {
    modelId: config.embeddingModel,
    // EmbeddingGemma prompt conventions for retrieval documents and queries.
    embedDocuments: (docs) =>
      embed(docs.map((d) => `title: ${d.title || 'none'} | text: ${d.text}`)),
    embedQuery: async (query) => {
      const [vector] = await embed([`task: search result | query: ${query}`])
      if (!vector) throw new InferenceUnavailableError('empty embedding response')
      return vector
    },
  }
}

const chatResponse = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.nullable(z.string()) }),
        finish_reason: z.optional(z.nullable(z.string())),
      }),
    )
    .check(z.minLength(1)),
})

// What the model answers: sources by their number in the prompt ("n", "p"), never by ID.
// `fromNumbers` below maps them back, so callers only ever see real IDs.
const sourceNumbers = z.array(z.int()).check(z.minLength(1))
const choiceByNumber = z.object({ choice: z.int(), rationale: z.string() })
const matchByNumber = z.object({
  decision: storyMatchSchema.shape.decision,
  evidenceArticles: z.array(z.int()),
  rationale: z.string(),
})
const summaryByNumber = z.extend(
  z.omit(storySummarySchema, { sourceArticleIds: true, observationIds: true }),
  { sources: sourceNumbers },
)
const summaryUpdateByNumber = z.extend(
  z.omit(summaryUpdateAssessmentSchema, { sourceArticleIds: true, observationIds: true }),
  { sources: z.array(z.int()) },
)
const contextByNumber = z.object({
  entries: z
    .array(
      z.object({
        anchorText: z.string().check(z.minLength(2), z.maxLength(80)),
        title: z.string(),
        kind: contextKindSchema,
        explanation: z.string(),
        sources: sourceNumbers,
      }),
    )
    .check(z.maxLength(6)),
})
const claimsByNumber = z.object({
  claims: z
    .array(
      z.object({
        proposition: z.string().check(z.minLength(8), z.maxLength(300)),
        mentions: z
          .array(z.object({ n: z.int(), stance: claimStanceSchema }))
          .check(z.minLength(1)),
        evidence: z.array(z.object({ p: z.int(), relationship: claimEvidenceRelationSchema })),
      }),
    )
    .check(z.maxLength(5)),
})

/** The item a 1-based number in the prompt referred to; a number outside the list is invalid output. */
function numbered<T>(name: string, list: readonly T[], n: number): T {
  const item = list[n - 1]
  if (item === undefined) {
    throw new InvalidModelOutputError(`${name}: cites source ${n}, but there are ${list.length}`)
  }
  return item
}

// Most answers are short; summaries and claims list several sources per item.
const MAX_TOKENS = { default: 1200, long: 2400 }
// How much of a bad response to keep in the error, for the Pipeline page.
const RESPONSE_EXCERPT_CHARS = 300

export function createLocalGeneration(config: LocalConfig): GenerationProvider {
  async function generate<T>(
    name: string,
    schema: z.ZodMiniType<T>,
    prompt: string,
    promptVersion: string,
    maxTokens = MAX_TOKENS.default,
  ) {
    const json = chatResponse.parse(
      await post(
        config,
        '/chat/completions',
        {
          model: config.generationModel,
          temperature: 0.2,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name, strict: true, schema: z.toJSONSchema(schema) },
          },
        },
        120_000,
      ),
    )
    const choice = json.choices[0]
    const content = choice?.message.content ?? ''
    const excerpt = content.slice(0, RESPONSE_EXCERPT_CHARS)
    if (choice?.finish_reason === 'length') {
      throw new InvalidModelOutputError(
        `${name}: response truncated at ${maxTokens} tokens. Starts: ${excerpt}`,
      )
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      throw new InvalidModelOutputError(`${name}: response is not JSON. Starts: ${excerpt}`)
    }
    const result = schema.safeParse(parsed)
    if (!result.success) {
      throw new InvalidModelOutputError(`${name}: ${z.prettifyError(result.error)}`)
    }
    return { output: result.data, modelId: config.generationModel, promptVersion }
  }

  return {
    modelId: config.generationModel,
    matchStory: async (input) => {
      const g = await generate(
        'story_match',
        matchByNumber,
        matchStoryPrompt(input),
        PROMPT_VERSIONS.matchStory,
      )
      const { evidenceArticles, ...rest } = g.output
      const articles = input.story.articles
      return {
        ...g,
        output: {
          ...rest,
          evidenceArticleIds: evidenceArticles.map(
            (n) => numbered('story_match', articles, n).articleId,
          ),
        },
      }
    },
    chooseStory: async (input) => {
      const g = await generate(
        'story_choice',
        choiceByNumber,
        chooseStoryPrompt(input),
        PROMPT_VERSIONS.chooseStory,
      )
      const { choice, rationale } = g.output
      const storyId = choice === 0 ? null : numbered('story_choice', input.stories, choice).storyId
      return { ...g, output: { storyId, rationale } }
    },
    summarizeStory: async (input) => {
      const g = await generate(
        'story_summary',
        summaryByNumber,
        summarizeStoryPrompt(input),
        PROMPT_VERSIONS.summarizeStory,
        MAX_TOKENS.long,
      )
      const { sources, ...rest } = g.output
      const used = sources.map((n) => numbered('story_summary', input.story.articles, n))
      return {
        ...g,
        output: {
          ...rest,
          sourceArticleIds: used.map((a) => a.articleId),
          observationIds: used.map((a) => a.observationId),
        },
      }
    },
    assessSummaryUpdate: async (input) => {
      const g = await generate(
        'summary_update_assessment',
        summaryUpdateByNumber,
        assessSummaryUpdatePrompt(input),
        PROMPT_VERSIONS.assessSummaryUpdate,
      )
      if (g.output.outcome !== 'material') {
        return {
          ...g,
          output: {
            changeKind: null,
            outcome: g.output.outcome,
            note: '',
            sourceArticleIds: [],
            observationIds: [],
          },
        }
      }
      const used = g.output.sources.map((n) =>
        numbered('summary_update_assessment', input.update.articles, n),
      )
      return {
        ...g,
        output: {
          changeKind: g.output.changeKind,
          outcome: g.output.outcome,
          note: g.output.note,
          sourceArticleIds: used.map((article) => article.articleId),
          observationIds: used.map((article) => article.observationId),
        },
      }
    },
    classifyRelationship: (input) =>
      generate(
        'relationship_candidate',
        relationshipCandidateSchema,
        classifyRelationshipPrompt(input),
        PROMPT_VERSIONS.classifyRelationship,
      ),
    explainContext: async (input) => {
      const g = await generate(
        'story_context',
        contextByNumber,
        explainContextPrompt(input),
        PROMPT_VERSIONS.explainContext,
      )
      const articles = input.story.articles
      return {
        ...g,
        output: {
          entries: g.output.entries.map(({ sources, ...entry }) => ({
            ...entry,
            sourceObservationIds: sources.map(
              (n) => numbered('story_context', articles, n).observationId,
            ),
          })),
        },
      }
    },
    extractClaims: async (input) => {
      const g = await generate(
        'story_claims',
        claimsByNumber,
        extractClaimsPrompt(input),
        PROMPT_VERSIONS.extractClaims,
        MAX_TOKENS.long,
      )
      const { articles } = input.story
      return {
        ...g,
        output: {
          claims: g.output.claims.map((c) => ({
            proposition: c.proposition,
            mentions: c.mentions.map((m) => ({
              articleId: numbered('story_claims', articles, m.n).articleId,
              stance: m.stance,
            })),
            evidence: c.evidence.map((e) => ({
              sourceReferenceId: numbered('story_claims', input.primarySources, e.p)
                .sourceReferenceId,
              relationship: e.relationship,
            })),
          })),
        },
      }
    },
    titleNarrative: (input) =>
      generate(
        'narrative_title',
        narrativeTitleSchema,
        titleNarrativePrompt(input),
        PROMPT_VERSIONS.titleNarrative,
      ),
  }
}
