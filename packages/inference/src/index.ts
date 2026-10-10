import { createFixtureEmbeddings, createFixtureGeneration } from './fixture.ts'
import { createLocalEmbeddings, createLocalGeneration } from './local.ts'
import type { InferenceProviders } from './types.ts'

export { createCloudGeneration } from './cloud.ts'
export * from './fixture.ts'
export * from './local.ts'
export { PROMPT_VERSIONS } from './prompts.ts'
export * from './types.ts'

export function createInferenceFromEnv(env = process.env): InferenceProviders {
  const mode = env.INFERENCE_MODE === 'local' ? 'local' : 'fixture'
  if (mode === 'fixture') {
    return { mode, embeddings: createFixtureEmbeddings(), generation: createFixtureGeneration() }
  }
  if (!env.INFERENCE_BASE_URL) throw new Error('INFERENCE_BASE_URL is required in local mode')
  const config = {
    baseUrl: env.INFERENCE_BASE_URL,
    apiKey: env.INFERENCE_API_KEY || undefined,
    embeddingModel: env.INFERENCE_EMBEDDING_MODEL ?? 'embeddinggemma-2',
    generationModel: env.INFERENCE_GENERATION_MODEL ?? 'gemma-4-26B-A4B',
  }
  return {
    mode,
    embeddings: createLocalEmbeddings(config),
    generation: createLocalGeneration(config),
  }
}
