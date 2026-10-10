import { contentTokens, jaccard, truncate } from '@dn/domain'
import { PROMPT_VERSIONS } from './prompts.ts'
import {
  type ArticleInput,
  EMBEDDING_DIMENSIONS,
  type EmbeddingProvider,
  type GenerationProvider,
  type StoryInput,
} from './types.ts'

// Deterministic, GPU-free stand-ins. Good enough to exercise every pipeline stage;
// not a quality benchmark for the real models.

function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Hashed bag-of-words vector, L2-normalised, so cosine similarity tracks word overlap. */
export function fixtureVector(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0)
  for (const token of contentTokens(text)) {
    const h = fnv1a(token)
    const index = h % EMBEDDING_DIMENSIONS
    vector[index] = (vector[index] ?? 0) + (h & 0x100000 ? 1 : -1)
  }
  const norm = Math.hypot(...vector) || 1
  return vector.map((v) => v / norm)
}

const articleTokens = (a: ArticleInput) => contentTokens(`${a.title} ${a.description ?? ''}`)
const storyTokens = (s: StoryInput) => s.articles.flatMap(articleTokens)

export const FIXTURE_EMBEDDING_MODEL = 'fixture-embedding@1'
export const FIXTURE_GENERATION_MODEL = 'fixture-generation@1'

export function createFixtureEmbeddings(): EmbeddingProvider {
  return {
    modelId: FIXTURE_EMBEDDING_MODEL,
    embedDocuments: async (docs) => docs.map((d) => fixtureVector(`${d.title} ${d.text}`)),
    embedQuery: async (query) => fixtureVector(query),
  }
}

export function createFixtureGeneration(): GenerationProvider {
  const modelId = FIXTURE_GENERATION_MODEL
  return {
    modelId,
    async matchStory({ article, story }) {
      const score = jaccard(articleTokens(article), storyTokens(story))
      const decision =
        score >= 0.22
          ? 'same_development'
          : score >= 0.1
            ? 'related_development'
            : score >= 0.06
              ? 'uncertain'
              : 'unrelated'
      return {
        output: {
          decision,
          evidenceArticleIds:
            decision === 'unrelated' ? [] : story.articles.map((a) => a.articleId),
          rationale: `fixture: token overlap ${score.toFixed(2)}`,
        },
        modelId,
        promptVersion: PROMPT_VERSIONS.matchStory,
      }
    },
    async summarizeStory({ story }) {
      const [lead, ...rest] = story.articles
      if (!lead) throw new Error('summarizeStory requires at least one article')
      const others = rest.map((a) => a.publisher)
      const reportedBy =
        others.length > 0 ? `${lead.publisher} and ${others.join(', ')}` : lead.publisher
      const detail = lead.description ? ` ${truncate(lead.description, 280)}` : ''
      return {
        output: {
          headline: truncate(lead.title, 140),
          summary: `Reported by ${reportedBy}.${detail}`,
          sourceArticleIds: story.articles.map((a) => a.articleId),
          observationIds: story.articles.map((a) => a.observationId),
        },
        modelId,
        promptVersion: PROMPT_VERSIONS.summarizeStory,
      }
    },
    async classifyRelationship({ newer, older }) {
      const score = jaccard(storyTokens(newer), storyTokens(older))
      const related = score >= 0.08
      return {
        output: {
          decision: related ? 'related' : 'unrelated',
          relation: related ? (score >= 0.15 ? 'follows' : 'related_to') : null,
          rationale: `fixture: token overlap ${score.toFixed(2)}`,
        },
        modelId,
        promptVersion: PROMPT_VERSIONS.classifyRelationship,
      }
    },
    async titleNarrative({ stories }) {
      const counts = new Map<string, number>()
      for (const s of stories) {
        for (const t of new Set(contentTokens(s.title))) counts.set(t, (counts.get(t) ?? 0) + 1)
      }
      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([t]) => t[0]?.toUpperCase() + t.slice(1))
      return {
        output: {
          title: top.length > 0 ? top.join(', ') : 'Developing narrative',
          description: `Tracks ${stories.length} connected developments.`,
        },
        modelId,
        promptVersion: PROMPT_VERSIONS.titleNarrative,
      }
    },
  }
}
