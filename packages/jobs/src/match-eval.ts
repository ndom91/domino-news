import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { type Db, schema } from '@dn/db'
import { type GenerationProvider, InvalidModelOutputError, PROMPT_VERSIONS } from '@dn/inference'
import { inArray, sql } from 'drizzle-orm'
import { loadArticles } from './inputs.ts'
import { decideMatch, type MatchPolicy, type Neighbour, rankStories } from './match-core.ts'

// Match quality evaluation. A set is a sample of real articles (public feed metadata only);
// its labels group them into stories by docs/story-granularity.md. See docs/006.

export interface EvalArticle {
  id: string
  publisher: string
  publisherKind: 'newsroom' | 'official'
  title: string
  description: string | null
  publishedAt: string
}

export interface EvalSet {
  name: string
  createdAt: string
  // How the set was drawn, so it can be redrawn or extended.
  sample: { days: number; seeds: string[]; neighbourMin: number; randomCount: number }
  articles: EvalArticle[]
}

type Row = {
  id: string
  publisher: string
  kind: 'newsroom' | 'official'
  title: string
  description: string | null
  at: Date
}

/**
 * Draw an evaluation set: for each seed (a title pattern), every article within `days` whose
 * embedding is close to the centre of the seed's articles, so the set holds busy events and
 * their confusable neighbours. Then `randomCount` other articles from the same window.
 */
export async function sampleMatchSet(
  db: Db,
  opts: { name: string; days: number; seeds: string[]; neighbourMin: number; randomCount: number },
): Promise<EvalSet> {
  const ids = new Set<string>()
  const window = sql`coalesce(a.published_at, a.first_seen_at) > now() - make_interval(days => ${opts.days})`
  for (const seed of opts.seeds) {
    const { rows } = await db.execute<{ id: string }>(sql`
      with seed as (
        select avg(e.embedding) as centre
        from article a
        join article_revision r on r.id = a.latest_revision_id
        join article_embedding e on e.article_id = a.id
        where ${window} and r.title ~* ${seed}
      )
      select a.id
      from article a
      join article_embedding e on e.article_id = a.id, seed
      where ${window} and seed.centre is not null
        and 1 - (e.embedding <=> seed.centre) >= ${opts.neighbourMin}`)
    for (const r of rows) ids.add(r.id)
  }
  const { rows: random } = await db.execute<{ id: string }>(sql`
    select a.id from article a
    join article_embedding e on e.article_id = a.id
    where ${window}
    order by random()
    limit ${opts.randomCount * 3}`)
  let added = 0
  for (const r of random) {
    if (added >= opts.randomCount) break
    if (ids.has(r.id)) continue
    ids.add(r.id)
    added++
  }

  const { rows } = await db.execute<Row>(sql`
    select a.id, p.name as publisher, p.kind, r.title, r.description,
      coalesce(a.published_at, a.first_seen_at) as at
    from article a
    join publisher p on p.id = a.publisher_id
    join article_revision r on r.id = a.latest_revision_id
    where a.id in ${sql`(${sql.join(
      [...ids].map((id) => sql`${id}`),
      sql`, `,
    )})`}
    order by at, a.id`)
  return {
    name: opts.name,
    createdAt: new Date().toISOString(),
    sample: {
      days: opts.days,
      seeds: opts.seeds,
      neighbourMin: opts.neighbourMin,
      randomCount: opts.randomCount,
    },
    articles: rows.map((r) => ({
      id: r.id,
      publisher: r.publisher,
      publisherKind: r.kind,
      title: r.title,
      description: r.description,
      publishedAt: new Date(r.at).toISOString(),
    })),
  }
}

export async function writeJson(file: string, value: unknown) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`)
}

// Replay and scoring

type StoryState = { id: string; articleIds: string[] }

export const cosine = (a: number[], b: number[]) => {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    dot += x * y
    na += x * x
    nb += y * y
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}

/**
 * Replay matching over a set in publish order, entirely in memory: neighbours come from the
 * set's own embeddings (within the production time window), decisions from the same core as
 * the match job (match-core.ts). The model is asked through `judge`, which callers cache.
 *
 * Differs from production in two known ways: only articles in the set can be neighbours, and
 * candidate stories carry no summary (titles and articles only).
 */
export async function replayMatching(
  articles: { id: string; publishedAt: string; embedding: number[] }[],
  policy: MatchPolicy,
  opts: { neighbours: number; windowSeconds: number },
  judge: (articleId: string, story: StoryState) => Promise<boolean>,
): Promise<Map<string, string>> {
  const ordered = [...articles].sort(
    (a, b) => a.publishedAt.localeCompare(b.publishedAt) || a.id.localeCompare(b.id),
  )
  const storyOf = new Map<string, string>()
  const stories = new Map<string, StoryState>()
  const seen: typeof ordered = []
  for (const article of ordered) {
    const at = Date.parse(article.publishedAt)
    const neighbours: Neighbour[] = seen
      .filter((o) => Math.abs(Date.parse(o.publishedAt) - at) <= opts.windowSeconds * 1000)
      .map((o) => ({ articleId: o.id, similarity: cosine(article.embedding, o.embedding) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, opts.neighbours)
    const ranked = rankStories(neighbours, (id) => storyOf.get(id), policy.llmMin)
    const decision = await decideMatch(ranked, policy, async (storyId) => {
      const story = stories.get(storyId)
      return story ? { same: await judge(article.id, story) } : null
    })
    const storyId = decision?.storyId ?? `story-${stories.size + 1}`
    const story = stories.get(storyId) ?? { id: storyId, articleIds: [] }
    story.articleIds.push(article.id)
    stories.set(storyId, story)
    storyOf.set(article.id, storyId)
    seen.push(article)
  }
  return storyOf
}

export interface Score {
  precision: number
  recall: number
  f1: number
  predictedStories: number
  labelledStories: number
  predictedSingletons: number
  labelledSingletons: number
}

/**
 * B-cubed precision and recall: for each article, how much of its predicted story belongs to
 * its true story (precision; low = over-merging) and how much of its true story it was put
 * with (recall; low = fragmentation). Averaged over articles.
 */
export function bcubed(predicted: Map<string, string>, labelled: Map<string, string>): Score {
  const members = (m: Map<string, string>) => {
    const out = new Map<string, Set<string>>()
    for (const [article, cluster] of m) {
      const set = out.get(cluster) ?? new Set<string>()
      set.add(article)
      out.set(cluster, set)
    }
    return out
  }
  const pred = members(predicted)
  const gold = members(labelled)
  let p = 0
  let r = 0
  const ids = [...labelled.keys()]
  for (const id of ids) {
    const inPred = pred.get(predicted.get(id) ?? '') ?? new Set([id])
    const inGold = gold.get(labelled.get(id) ?? '') ?? new Set([id])
    let both = 0
    for (const other of inPred) if (inGold.has(other)) both++
    p += both / inPred.size
    r += both / inGold.size
  }
  const precision = p / ids.length
  const recall = r / ids.length
  const sizes = (m: Map<string, Set<string>>) => [...m.values()].map((s) => s.size)
  return {
    precision,
    recall,
    f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
    predictedStories: pred.size,
    labelledStories: gold.size,
    predictedSingletons: sizes(pred).filter((n) => n === 1).length,
    labelledSingletons: sizes(gold).filter((n) => n === 1).length,
  }
}

// Runner: set + labels + embeddings from the DB, a cached model judge, a report.

type CacheEntry = { key: string; decision: string }

export interface EvalReport {
  set: string
  label: string
  ranAt: string
  policy: MatchPolicy
  promptVersion: string
  modelId: string
  score: Score
  modelCalls: number
  cachedCalls: number
  failedCalls: number
  // Labelled stories split across several predicted ones, worst first.
  fragmented: { title: string; size: number; pieces: number }[]
  // Predicted stories that mix several labelled ones, worst first.
  overMerged: { size: number; labelled: string[] }[]
}

export async function runMatchEval(
  ctx: { db: Db; inference: { generation: GenerationProvider }; config: { fixtureDir: string } },
  opts: {
    name: string
    label: string
    policy: MatchPolicy
    neighbours: number
    windowSeconds: number
    log?: (msg: string) => void
  },
): Promise<EvalReport> {
  const log = opts.log ?? (() => {})
  const dir = `${ctx.config.fixtureDir}/match-eval`
  const set: EvalSet = JSON.parse(await readFile(`${dir}/${opts.name}.json`, 'utf8'))
  const labels: { groups: { id: string; title: string; articleIds: string[] }[] } = JSON.parse(
    await readFile(`${dir}/${opts.name}.labels.json`, 'utf8'),
  )
  const ids = set.articles.map((a) => a.id)
  const vectors = await ctx.db
    .select({
      id: schema.articleEmbedding.articleId,
      embedding: schema.articleEmbedding.embedding,
    })
    .from(schema.articleEmbedding)
    .where(inArray(schema.articleEmbedding.articleId, ids))
  const embeddingOf = new Map(vectors.map((v) => [v.id, v.embedding]))
  const missing = ids.filter((id) => !embeddingOf.has(id))
  if (missing.length)
    throw new Error(`no embedding for ${missing.length} articles, e.g. ${missing[0]}`)
  const inputOf = new Map((await loadArticles(ctx.db, ids)).map((a) => [a.articleId, a]))

  // Decisions are cached per prompt version and model, keyed on the exact article and story.
  const { modelId } = ctx.inference.generation
  const promptVersion = PROMPT_VERSIONS.matchStory
  const cacheDir = `${dir}/cache`
  await mkdir(cacheDir, { recursive: true })
  const cacheFile = `${cacheDir}/${opts.name}.${promptVersion}.${modelId.replaceAll('/', '_')}.jsonl`
  const cache = new Map<string, string>()
  const raw = await readFile(cacheFile, 'utf8').catch(() => '')
  for (const line of raw.split('\n').filter(Boolean)) {
    const e = JSON.parse(line) as CacheEntry
    cache.set(e.key, e.decision)
  }

  let modelCalls = 0
  let cachedCalls = 0
  let failedCalls = 0
  const judge = async (articleId: string, story: { id: string; articleIds: string[] }) => {
    const key = createHash('sha256')
      .update(`${articleId}|${[...story.articleIds].sort().join(',')}`)
      .digest('hex')
    const hit = cache.get(key)
    if (hit) {
      cachedCalls++
      return hit === 'same_development'
    }
    const article = inputOf.get(articleId)
    const members = story.articleIds.flatMap((id) => inputOf.get(id) ?? [])
    if (!article || members.length === 0) return false
    // Like loadStoryInput: the newest 12 reports, oldest first; the first report's headline.
    const newest = [...members]
      .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
      .slice(0, 12)
      .reverse()
    const first = [...members].sort((a, b) =>
      (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''),
    )[0]
    let decision: string
    try {
      modelCalls++
      const { output } = await ctx.inference.generation.matchStory({
        article,
        story: {
          storyId: story.id,
          title: first?.title ?? '',
          summary: null,
          firstObservedAt: first?.publishedAt ?? new Date().toISOString(),
          articles: newest,
        },
      })
      decision = output.decision
    } catch (error) {
      if (!(error instanceof InvalidModelOutputError)) throw error
      failedCalls++
      decision = 'invalid_output'
    }
    cache.set(key, decision)
    await appendFile(cacheFile, `${JSON.stringify({ key, decision } satisfies CacheEntry)}\n`)
    if ((modelCalls + cachedCalls) % 25 === 0)
      log(`${modelCalls} model calls, ${cachedCalls} cached`)
    return decision === 'same_development'
  }

  const predicted = await replayMatching(
    set.articles.map((a) => ({
      id: a.id,
      publishedAt: a.publishedAt,
      embedding: embeddingOf.get(a.id) ?? [],
    })),
    opts.policy,
    { neighbours: opts.neighbours, windowSeconds: opts.windowSeconds },
    judge,
  )

  const labelled = new Map<string, string>()
  const titleOf = new Map<string, string>()
  for (const g of labels.groups) {
    titleOf.set(g.id, g.title)
    for (const id of g.articleIds) labelled.set(id, g.id)
  }
  const score = bcubed(predicted, labelled)

  const piecesOf = new Map<string, Set<string>>()
  const goldIn = new Map<string, Set<string>>()
  const predSize = new Map<string, number>()
  for (const [article, gold] of labelled) {
    const pred = predicted.get(article) ?? article
    piecesOf.set(gold, (piecesOf.get(gold) ?? new Set()).add(pred))
    goldIn.set(pred, (goldIn.get(pred) ?? new Set()).add(gold))
    predSize.set(pred, (predSize.get(pred) ?? 0) + 1)
  }
  const sizeOf = (g: string) => labels.groups.find((x) => x.id === g)?.articleIds.length ?? 0
  const fragmented = [...piecesOf]
    .filter(([, p]) => p.size > 1)
    .map(([g, p]) => ({ title: titleOf.get(g) ?? g, size: sizeOf(g), pieces: p.size }))
    .sort((a, b) => b.pieces - a.pieces || b.size - a.size)
    .slice(0, 15)
  const overMerged = [...goldIn]
    .filter(([, g]) => g.size > 1)
    .map(([p, g]) => ({
      size: predSize.get(p) ?? 0,
      labelled: [...g].map((x) => titleOf.get(x) ?? x),
    }))
    .sort((a, b) => b.labelled.length - a.labelled.length || b.size - a.size)
    .slice(0, 15)

  const report: EvalReport = {
    set: opts.name,
    label: opts.label,
    ranAt: new Date().toISOString(),
    policy: opts.policy,
    promptVersion,
    modelId,
    score,
    modelCalls,
    cachedCalls,
    failedCalls,
    fragmented,
    overMerged,
  }
  await mkdir(`${dir}/results`, { recursive: true })
  await writeJson(`${dir}/results/${opts.name}.${opts.label}.json`, report)
  return report
}
