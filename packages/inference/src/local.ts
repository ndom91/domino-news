import {
  narrativeTitleSchema,
  relationshipCandidateSchema,
  storyMatchSchema,
  storySummarySchema,
} from '@dn/schemas'
import { z } from 'zod'
import {
  classifyRelationshipPrompt,
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
  timeoutMs?: number
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
        await post(
          config,
          '/embeddings',
          { model: config.embeddingModel, input: batch },
          config.timeoutMs ?? 60_000,
        ),
      )
      const sorted = [...json.data].sort((a, b) => a.index - b.index)
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
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
})

export function createLocalGeneration(config: LocalConfig): GenerationProvider {
  async function generate<T>(
    name: string,
    schema: z.ZodType<T>,
    prompt: string,
    promptVersion: string,
  ) {
    const json = chatResponse.parse(
      await post(
        config,
        '/chat/completions',
        {
          model: config.generationModel,
          temperature: 0.2,
          max_tokens: 1200,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name, strict: true, schema: z.toJSONSchema(schema) },
          },
        },
        config.timeoutMs ?? 120_000,
      ),
    )
    const content = json.choices[0]?.message.content ?? ''
    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch {
      throw new InvalidModelOutputError(`${name}: response is not JSON`)
    }
    const result = schema.safeParse(parsed)
    if (!result.success) {
      throw new InvalidModelOutputError(`${name}: ${z.prettifyError(result.error)}`)
    }
    return { output: result.data, modelId: config.generationModel, promptVersion }
  }

  return {
    modelId: config.generationModel,
    matchStory: (input) =>
      generate(
        'story_match',
        storyMatchSchema,
        matchStoryPrompt(input),
        PROMPT_VERSIONS.matchStory,
      ),
    summarizeStory: (input) =>
      generate(
        'story_summary',
        storySummarySchema,
        summarizeStoryPrompt(input),
        PROMPT_VERSIONS.summarizeStory,
      ),
    classifyRelationship: (input) =>
      generate(
        'relationship_candidate',
        relationshipCandidateSchema,
        classifyRelationshipPrompt(input),
        PROMPT_VERSIONS.classifyRelationship,
      ),
    titleNarrative: (input) =>
      generate(
        'narrative_title',
        narrativeTitleSchema,
        titleNarrativePrompt(input),
        PROMPT_VERSIONS.titleNarrative,
      ),
  }
}
