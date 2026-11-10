import { existsSync, readFileSync } from 'node:fs'
import tls from 'node:tls'
import { createFixtureEmbeddings, createFixtureGeneration } from './fixture.ts'
import {
  createLocalEmbeddings,
  createLocalGeneration,
  createLocalStoryChoiceDecision,
} from './local.ts'
import type { InferenceProviders } from './types.ts'

export * from './fixture.ts'
export * from './local.ts'
export {
  classifyRelationshipPrompt,
  explainContextPrompt,
  PROMPT_VERSIONS,
  summarizeStoryPrompt,
} from './prompts.ts'
export * from './types.ts'

export function createInferenceFromEnv(env = process.env): InferenceProviders {
  const mode = env.INFERENCE_MODE === 'local' ? 'local' : 'fixture'
  if (mode === 'fixture') {
    return { mode, embeddings: createFixtureEmbeddings(), generation: createFixtureGeneration() }
  }
  if (!env.INFERENCE_BASE_URL) throw new Error('INFERENCE_BASE_URL is required in local mode')
  if (env.INFERENCE_CA_CERT) trustExtraCa(env.INFERENCE_CA_CERT)
  const config = {
    baseUrl: env.INFERENCE_BASE_URL,
    apiKey: env.INFERENCE_API_KEY || undefined,
    embeddingModel: env.INFERENCE_EMBEDDING_MODEL ?? 'embeddinggemma-2',
    generationModel: env.INFERENCE_GENERATION_MODEL ?? 'gemma-4-26B-A4B',
  }
  const decisionModel = env.INFERENCE_MATCH_DECISION_MODEL
  return {
    mode,
    embeddings: createLocalEmbeddings(config),
    generation: createLocalGeneration(config),
    ...(decisionModel
      ? { decision: createLocalStoryChoiceDecision({ ...config, decisionModel }) }
      : {}),
  }
}

// Private CA for the inference endpoint (e.g. a LAN or WireGuard host). Unlike
// NODE_EXTRA_CA_CERTS this also works when env vars come from `--env-file`.
let caLoaded = false
function trustExtraCa(path: string) {
  if (caLoaded) return
  if (!existsSync(path)) {
    console.warn(`[inference] INFERENCE_CA_CERT not found at ${path}; using system CAs only`)
    caLoaded = true
    return
  }
  tls.setDefaultCACertificates([...tls.getCACertificates('default'), readFileSync(path, 'utf8')])
  caLoaded = true
}
