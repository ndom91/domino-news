import type { GenerationProvider } from './types.ts'

/**
 * Optional frontier/cloud provider. Intentionally disabled in v1: all tasks run on local models.
 * Kept as an interface placeholder so routing can be added without changing callers.
 */
export function createCloudGeneration(): GenerationProvider {
  const disabled = async (): Promise<never> => {
    throw new Error('cloud inference is disabled in this prototype')
  }
  return {
    modelId: 'cloud-disabled',
    matchStory: disabled,
    summarizeStory: disabled,
    classifyRelationship: disabled,
    titleNarrative: disabled,
    explainContext: disabled,
    extractClaims: disabled,
  }
}
