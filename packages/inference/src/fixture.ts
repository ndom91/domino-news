import { contentTokens, jaccard, regionForCountry, truncate } from '@dn/domain'
import { type Desk, EMBEDDING_DIMENSIONS, type Place, type Region, type Topic } from '@dn/schemas'
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

// Deterministic place tags from the reporting text, never from a publisher's home country.
const FIXTURE_PLACES: [Place, RegExp][] = [
  [{ city: 'Washington', county: null, country: 'US' }, /\bWashington(?:,? D\.?C\.?)?\b/i],
  [{ city: 'New York City', county: null, country: 'US' }, /\bNew York(?: City)?\b/i],
  [{ city: 'London', county: null, country: 'GB' }, /\bLondon\b/i],
  [{ city: 'Kyiv', county: null, country: 'UA' }, /\bKyiv\b/i],
  [{ city: null, county: null, country: 'UA' }, /\bUkrain(?:e|ian)\b/i],
  [{ city: null, county: null, country: 'US' }, /\b(?:United States|U\.S\.|US)\b/i],
  [{ city: null, county: null, country: 'GB' }, /\b(?:United Kingdom|Britain|British|UK)\b/i],
  [{ city: null, county: null, country: 'DE' }, /\bGerman(?:y)?\b/i],
  [{ city: null, county: null, country: 'FR' }, /\bFr(?:ance|ench)\b/i],
  [{ city: null, county: null, country: 'IN' }, /\bIndia(?:n)?\b/i],
]

function fixtureLocations(s: StoryInput): Place[] {
  const text = s.articles.map((a) => `${a.title} ${a.description ?? ''}`).join(' ')
  const found = FIXTURE_PLACES.filter(([, pattern]) => pattern.test(text)).map(([place]) => place)
  return found
    .filter(
      (place, index) =>
        found.findIndex(
          (other) =>
            other.city === place.city &&
            other.county === place.county &&
            other.country === place.country,
        ) === index,
    )
    .slice(0, 5)
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

// Stand-in for model topic tagging: keyword hits in the lead headline, at most 3.
const TOPIC_KEYWORDS: [Topic, RegExp][] = [
  ['elections', /\b(election|vote|voters|ballot|poll|polls|campaign)\b/i],
  ['diplomacy', /\b(summit|talks|envoy|diplomat|treaty|minister)\b/i],
  ['migration', /\b(migrants?|refugees?|asylum|border)\b/i],
  ['climate', /\b(climate|emissions|warming|carbon)\b/i],
  ['public-health', /\b(health|virus|outbreak|disease|vaccine|hospital)\b/i],
  ['space', /\b(space|nasa|rocket|satellite|moon|mars)\b/i],
  ['disasters', /\b(earthquake|flood|hurricane|wildfire|storm|drought)\b/i],
  ['markets', /\b(market|stocks|shares|bank|rates?)\b/i],
  ['trade', /\b(trade|tariffs?|exports?|imports?)\b/i],
  ['energy', /\b(oil|gas|energy|diesel|power)\b/i],
  ['ai', /\b(ai|artificial intelligence|chatbot)\b/i],
  ['courts', /\b(court|judge|trial|ruling|lawsuit)\b/i],
  ['crime', /\b(police|arrested|murder|shooting|prison)\b/i],
  ['ukraine-war', /\b(ukraine|kyiv|zelensky)\b/i],
  ['middle-east-conflict', /\b(gaza|israel|hamas|hezbollah|iran)\b/i],
  ['sport', /\b(match|league|cup|olympic|football|tennis)\b/i],
  ['arts', /\b(film|book|novel|music|festival|prize)\b/i],
]

export function fixtureTopics(headline: string): Topic[] {
  return TOPIC_KEYWORDS.filter(([, re]) => re.test(headline))
    .map(([t]) => t)
    .slice(0, 3)
}

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
    async writeAudioBriefing() {
      throw new Error('Audio briefing requires local generation inference to be configured')
    },
    // The story with the most token overlap, if it clears the "same development" bar.
    async chooseStory({ article, stories }) {
      const tokens = articleTokens(article)
      const scored = stories
        .map((story) => ({ story, score: jaccard(tokens, storyTokens(story)) }))
        .sort((a, b) => b.score - a.score)
      const best = scored[0]
      const chosen = best && best.score >= 0.22 ? best.story.storyId : null
      return {
        output: {
          storyId: chosen,
          rationale: `fixture: best token overlap ${best?.score.toFixed(2) ?? 'none'}`,
        },
        modelId,
        promptVersion: PROMPT_VERSIONS.chooseStory,
      }
    },
    async summarizeStory({ story }) {
      const [lead] = story.articles
      if (!lead) throw new Error('summarizeStory requires at least one article')
      // Each outlet cited with its position in the shown list, like the real prompt asks.
      const named = story.articles.map((a, i) => `${a.publisher}[${i + 1}]`)
      const reportedBy =
        named.length > 1 ? `${named.slice(0, -1).join(', ')} and ${named.at(-1)}` : named[0]
      const leadDescription = lead.description
        ? ` The first report describes “${truncate(lead.description, 280)}”.`
        : ''
      // Two cited paragraphs, like the real prompt asks: the first headline, then the other reports.
      const others = story.articles
        .slice(1, 4)
        .map(
          (a, i) =>
            `${a.publisher} reports “${truncate(a.description || a.title, 200)}”[${i + 2}].`,
        )
      const detail = `${lead.publisher} first reported “${truncate(lead.title, 140)}”[1].\n\n${others.join(' ') || 'No other publisher reports it yet.'}`
      return {
        output: {
          headline: truncate(lead.title, 140),
          summary: `Reported by ${reportedBy}.${leadDescription}`,
          detail,
          sourceArticleIds: story.articles.map((a) => a.articleId),
          observationIds: story.articles.map((a) => a.observationId),
          regions: fixtureRegions(story),
          locations: fixtureLocations(story),
          desk: fixtureDesk(lead.title),
          topics: fixtureTopics(lead.title),
        },
        modelId,
        promptVersion: PROMPT_VERSIONS.summarizeStory,
      }
    },
    async assessSummaryUpdate({ update }) {
      const article = update.articles[0]
      if (!article) throw new Error('assessSummaryUpdate requires at least one article')
      const text = `${article.title} ${article.description ?? ''}`.toLowerCase()
      const prior = update.previousSummary.toLowerCase()
      const material = text.split(/\W+/).some((word) => word.length > 5 && !prior.includes(word))
      return {
        output: material
          ? {
              changeKind: 'new_fact' as const,
              outcome: 'material' as const,
              note: `Added reporting from ${article.publisher} about ${truncate(article.title, 160)}.`,
              sourceArticleIds: [article.articleId],
              observationIds: [article.observationId],
            }
          : {
              changeKind: null,
              outcome: 'corroboration_only' as const,
              note: '',
              sourceArticleIds: [],
              observationIds: [],
            },
        modelId,
        promptVersion: PROMPT_VERSIONS.assessSummaryUpdate,
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
    async titleNarrative({ stories }) {
      // Stand-in for a model-written title: the first Story's headline reads like one.
      const first = stories[0]?.title
      return {
        output: {
          title: first ? truncate(first, 80) : 'Developing narrative',
          description: `Tracks ${stories.length} connected developments.`,
        },
        modelId,
        promptVersion: PROMPT_VERSIONS.titleNarrative,
      }
    },
  }
}
