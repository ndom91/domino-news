import { contentTokens, jaccard, regionForCountry, truncate } from '@dn/domain'
import { type Desk, EMBEDDING_DIMENSIONS, type Region } from '@dn/schemas'
import { PROMPT_VERSIONS } from './prompts.ts'
import type { ArticleInput, EmbeddingProvider, GenerationProvider, StoryInput } from './types.ts'

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

// Stand-in for model tagging: the publishers' home regions, capped at the schema's 3.
function fixtureRegions(s: StoryInput): Region[] {
  const regions = new Set<Region>()
  for (const a of s.articles) {
    const region = regionForCountry(a.publisherCountry)
    if (region) regions.add(region)
  }
  return regions.size > 0 ? [...regions].slice(0, 3) : ['global']
}

// Stand-in for model tagging: the first desk whose keywords appear in the lead headline.
// Justice comes first so "court halts strike" is a ruling, not a war story.
const DESK_KEYWORDS: [Desk, RegExp][] = [
  ['justice', /\b(court|trial|judge|police|prison|sentenced|execution|injunction|sanctions)\b/i],
  ['conflict', /\b(war|strike|strikes|attack|missile|drone|military|troops|army|ceasefire)\b/i],
  ['economy', /\b(bank|rate|rates|market|trade|tariff|prices|jobs|company|deal)\b/i],
  ['science', /\b(climate|health|virus|disease|space|wildfire|drought|study|scientists)\b/i],
  ['culture', /\b(prize|film|book|music|festival|sport|church|art)\b/i],
]

export function fixtureDesk(headline: string): Desk {
  return DESK_KEYWORDS.find(([, re]) => re.test(headline))?.[0] ?? 'politics'
}

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
      const [lead] = story.articles
      if (!lead) throw new Error('summarizeStory requires at least one article')
      // Each outlet cited with its position in the shown list, like the real prompt asks.
      const named = story.articles.map((a, i) => `${a.publisher}[${i + 1}]`)
      const reportedBy =
        named.length > 1 ? `${named.slice(0, -1).join(', ')} and ${named.at(-1)}` : named[0]
      const detail = lead.description ? ` ${truncate(lead.description, 280)}` : ''
      return {
        output: {
          headline: truncate(lead.title, 140),
          summary: `Reported by ${reportedBy}.${detail}`,
          sourceArticleIds: story.articles.map((a) => a.articleId),
          observationIds: story.articles.map((a) => a.observationId),
          regions: fixtureRegions(story),
          desk: fixtureDesk(lead.title),
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
    async explainContext({ story, summary }) {
      // Capitalised multi-word phrases from the summary that sources also mention.
      const phrases = [...new Set(summary.match(/\b(?:[A-Z][a-z]+ ){1,3}[A-Z][a-z]+\b/g) ?? [])]
      const entries = phrases.flatMap((phrase) => {
        const sources = story.articles.filter((a) =>
          `${a.title} ${a.description ?? ''}`.includes(phrase),
        )
        if (sources.length === 0) return []
        return [
          {
            anchorText: phrase,
            title: phrase,
            kind: 'background' as const,
            explanation: `${phrase} is mentioned in coverage by ${[...new Set(sources.map((a) => a.publisher))].join(', ')}.`,
            sourceObservationIds: sources.map((a) => a.observationId),
          },
        ]
      })
      return {
        output: { entries: entries.slice(0, 3) },
        modelId,
        promptVersion: PROMPT_VERSIONS.explainContext,
      }
    },
    async extractClaims({ story }) {
      const [lead] = story.articles
      return {
        output: {
          claims: lead
            ? [
                {
                  proposition: lead.title,
                  mentions: story.articles.map((a) => ({
                    articleId: a.articleId,
                    stance:
                      a.articleId === lead.articleId
                        ? ('asserts' as const)
                        : ('discusses' as const),
                  })),
                  evidence: [],
                },
              ]
            : [],
        },
        modelId,
        promptVersion: PROMPT_VERSIONS.extractClaims,
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
