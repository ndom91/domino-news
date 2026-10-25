import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { type Db, schema } from '@dn/db'
import { inArray } from 'drizzle-orm'
import { cosine, type EvalArticle } from './match-eval.ts'

export interface CandidateExample {
  /** Stable within the source evaluation set: `<article ID>:<candidate rank>`. */
  id: string
  articleId: string
  candidateStoryId: string
  candidateRank: number
  sameDevelopment: boolean
  features: {
    candidateCount: number
    topSimilarity: number
    nextSimilarity: number
    similarityGap: number
    centroidSimilarity: number
    firstSimilarity: number
    newestSimilarity: number
    cohesion: number
    nearestHours: number
    oldestHours: number
    candidateArticles: number
    samePublisher: boolean
    titleTokenOverlap: number
    sharedNumbers: number
  }
}

export interface CandidateGateResult {
  articlesWithCandidates: number
  skippedArticles: number
  falseSkips: number
  skipRate: number
  falseSkipRate: number | null
}

type Candidate = { storyId: string; articles: EvalArticle[]; similarities: number[] }

const tokens = (text: string | null) =>
  new Set((text ?? '').toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])

const overlap = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const token of a) if (b.has(token)) shared++
  return shared / (a.size + b.size - shared)
}

const numbers = (text: string | null) => new Set((text ?? '').match(/\d+(?:[.,]\d+)?/g) ?? [])

const meanVector = (vectors: number[][]) => {
  const mean = Array.from({ length: vectors[0]?.length ?? 0 }, () => 0)
  for (const vector of vectors)
    for (const [index, value] of vector.entries()) mean[index] = (mean[index] ?? 0) + value
  return mean.map((value) => value / vectors.length)
}

/**
 * Creates candidate-level examples from reviewed Story groups. Story membership is oracle
 * membership at the article's arrival, so labels never inherit a previous model mistake.
 */
export function candidateExamples(
  articles: EvalArticle[],
  labels: Map<string, string>,
  embeddings: Map<string, number[]>,
  opts: { minSimilarity: number; maxCandidates: number; windowSeconds: number },
): CandidateExample[] {
  const ordered = [...articles].sort(
    (a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id),
  )
  const seen: EvalArticle[] = []
  const out: CandidateExample[] = []
  for (const article of ordered) {
    const vector = embeddings.get(article.id)
    if (!vector) continue
    const at = Date.parse(article.publishedAt)
    const candidates = new Map<string, Candidate>()
    for (const prior of seen) {
      if (Math.abs(at - Date.parse(prior.publishedAt)) > opts.windowSeconds * 1000) continue
      const priorVector = embeddings.get(prior.id)
      const storyId = labels.get(prior.id)
      if (!priorVector || !storyId) continue
      const similarity = cosine(vector, priorVector)
      if (similarity < opts.minSimilarity) continue
      const candidate = candidates.get(storyId) ?? { storyId, articles: [], similarities: [] }
      candidate.articles.push(prior)
      candidate.similarities.push(similarity)
      candidates.set(storyId, candidate)
    }
    const ranked = [...candidates.values()]
      .sort((a, b) => Math.max(...b.similarities) - Math.max(...a.similarities))
      .slice(0, opts.maxCandidates)
    const articleTokens = tokens(`${article.title} ${article.description ?? ''}`)
    const articleNumbers = numbers(`${article.title} ${article.description ?? ''}`)
    for (const [index, candidate] of ranked.entries()) {
      const rankedSimilarities = ranked.map((item) => Math.max(...item.similarities))
      const candidateVectors = candidate.articles
        .map((item) => embeddings.get(item.id))
        .filter((item): item is number[] => item !== undefined)
      const oldest = candidate.articles[0]
      const newest = candidate.articles.at(-1)
      if (!oldest || !newest || candidateVectors.length === 0) continue
      const candidateText = candidate.articles
        .map((item) => `${item.title} ${item.description ?? ''}`)
        .join(' ')
      const candidateTokens = tokens(candidateText)
      const candidateNumbers = numbers(candidateText)
      const centroid = meanVector(candidateVectors)
      const cohesion =
        candidateVectors.length < 2
          ? 1
          : candidateVectors.reduce((total, item) => total + cosine(item, centroid), 0) /
            candidateVectors.length
      out.push({
        id: `${article.id}:${index + 1}`,
        articleId: article.id,
        candidateStoryId: candidate.storyId,
        candidateRank: index + 1,
        sameDevelopment: labels.get(article.id) === candidate.storyId,
        features: {
          candidateCount: ranked.length,
          topSimilarity: rankedSimilarities[index] ?? 0,
          nextSimilarity: rankedSimilarities[index + 1] ?? 0,
          similarityGap: (rankedSimilarities[index] ?? 0) - (rankedSimilarities[index + 1] ?? 0),
          centroidSimilarity: cosine(vector, centroid),
          firstSimilarity: cosine(vector, candidateVectors[0] ?? centroid),
          newestSimilarity: cosine(vector, candidateVectors.at(-1) ?? centroid),
          cohesion,
          nearestHours:
            Math.min(
              ...candidate.articles.map((item) => Math.abs(at - Date.parse(item.publishedAt))),
            ) / 3_600_000,
          oldestHours: Math.abs(at - Date.parse(oldest.publishedAt)) / 3_600_000,
          candidateArticles: candidate.articles.length,
          samePublisher: candidate.articles.some((item) => item.publisher === article.publisher),
          titleTokenOverlap: overlap(articleTokens, candidateTokens),
          sharedNumbers: [...articleNumbers].filter((item) => candidateNumbers.has(item)).length,
        },
      })
    }
    seen.push(article)
  }
  return out
}

/** Scores a gate that skips only when every candidate's match probability is below a threshold. */
export function evaluateCandidateGate(
  examples: CandidateExample[],
  matchProbability: (example: CandidateExample) => number,
  threshold: number,
): CandidateGateResult {
  const byArticle = new Map<string, CandidateExample[]>()
  for (const example of examples)
    byArticle.set(example.articleId, [...(byArticle.get(example.articleId) ?? []), example])
  let skippedArticles = 0
  let falseSkips = 0
  for (const candidates of byArticle.values()) {
    if (!candidates.every((candidate) => matchProbability(candidate) <= threshold)) continue
    skippedArticles++
    if (candidates.some((candidate) => candidate.sameDevelopment)) falseSkips++
  }
  return {
    articlesWithCandidates: byArticle.size,
    skippedArticles,
    falseSkips,
    skipRate: byArticle.size ? skippedArticles / byArticle.size : 0,
    falseSkipRate: skippedArticles ? falseSkips / skippedArticles : null,
  }
}

/** Materialises reviewed candidate examples for offline training; never reads production outcomes. */
export async function writeCandidateDataset(
  db: Db,
  fixtureDir: string,
  name: string,
  opts: { minSimilarity: number; maxCandidates: number; windowSeconds: number },
) {
  const dir = `${fixtureDir}/match-eval`
  const set = JSON.parse(await readFile(`${dir}/${name}.json`, 'utf8')) as {
    articles: EvalArticle[]
  }
  const labels = JSON.parse(await readFile(`${dir}/${name}.labels.json`, 'utf8')) as {
    groups: { id: string; articleIds: string[] }[]
  }
  const ids = set.articles.map((article) => article.id)
  const rows = await db
    .select({ id: schema.articleEmbedding.articleId, embedding: schema.articleEmbedding.embedding })
    .from(schema.articleEmbedding)
    .where(inArray(schema.articleEmbedding.articleId, ids))
  const embeddings = new Map(rows.map((row) => [row.id, row.embedding]))
  if (embeddings.size !== ids.length)
    throw new Error(`missing embeddings for ${ids.length - embeddings.size} articles`)
  const groupOf = new Map<string, string>()
  for (const group of labels.groups) for (const id of group.articleIds) groupOf.set(id, group.id)
  const examples = candidateExamples(set.articles, groupOf, embeddings, opts)
  const outDir = `${dir}/gate-datasets`
  await mkdir(outDir, { recursive: true })
  const file = `${outDir}/${name}.candidates.jsonl`
  await writeFile(file, `${examples.map((example) => JSON.stringify(example)).join('\n')}\n`)
  return {
    file,
    examples: examples.length,
    articles: new Set(examples.map((example) => example.articleId)).size,
  }
}
