import { type Db, schema } from '@dn/db'
import type { EmbeddingProvider } from '@dn/inference'
import type { SearchHit, SearchQuery, SearchResponse } from '@dn/schemas'
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { publishersByStory, sourceCounts } from '../reader.ts'
import type { Typesense } from './typesense.ts'

interface TsResult {
  hits?: {
    document: { id: string }
    text_match?: number
    hybrid_search_info?: { rank_fusion_score?: number }
  }[]
}

// When the embedding endpoint fails, skip it for a while so keyword search stays fast.
const BREAKER_COOLDOWN_MS = 60_000
const QUERY_EMBED_TIMEOUT_MS = 2500
let embeddingsDownUntil = 0

async function embedQueryWithBreaker(embeddings: EmbeddingProvider, q: string) {
  if (Date.now() < embeddingsDownUntil) return null
  try {
    const vector = await Promise.race([
      embeddings.embedQuery(q),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), QUERY_EMBED_TIMEOUT_MS)),
    ])
    if (!vector) embeddingsDownUntil = Date.now() + BREAKER_COOLDOWN_MS
    return vector
  } catch {
    embeddingsDownUntil = Date.now() + BREAKER_COOLDOWN_MS
    return null
  }
}

const SINCE_SECONDS = { '24h': 86_400, '7d': 7 * 86_400, '30d': 30 * 86_400 } as const

/**
 * Hybrid (keyword + vector) search via Typesense; falls back to keyword-only when the
 * embedding endpoint is unavailable, so search keeps working during a GPU outage.
 * Typesense only supplies candidate IDs and scores; documents are hydrated from Postgres.
 */
export async function searchAll(
  db: Db,
  ts: Typesense,
  embeddings: EmbeddingProvider,
  query: SearchQuery,
): Promise<SearchResponse> {
  const vector = await embedQueryWithBreaker(embeddings, query.q)

  const filters: string[] = []
  if (query.since !== 'all') {
    filters.push(`last_updated_at:>=${Math.floor(Date.now() / 1000) - SINCE_SECONDS[query.since]}`)
  }
  if (query.publisher) {
    const [pub] = await db
      .select({ id: schema.publisher.id })
      .from(schema.publisher)
      .where(eq(schema.publisher.slug, query.publisher))
    filters.push(`publisher_ids:=[${pub?.id ?? 'none'}]`)
  }
  // Region values come from a fixed enum, so they are safe inside filter_by.
  if (query.region) filters.push(`regions:=[${query.region}]`)

  const searches: Record<string, unknown>[] = []
  if (query.type !== 'narrative') {
    searches.push({
      collection: 'stories',
      q: query.q,
      // The vector part comes from vector_query; `embedding` must not appear in query_by.
      query_by: 'title,summary,publisher_names',
      ...(vector ? { vector_query: `embedding:([${vector.join(',')}], k:50, alpha:0.4)` } : {}),
      exclude_fields: 'embedding',
      filter_by: filters.join(' && ') || undefined,
      per_page: 20,
    })
  }
  if (query.type !== 'story' && !query.publisher && !query.region) {
    searches.push({
      collection: 'narratives',
      q: query.q,
      query_by: 'title,description',
      per_page: 5,
    })
  }
  const { results } = await ts.multiSearch<TsResult>(searches)
  const storyResult = query.type !== 'narrative' ? results[0] : undefined
  const narrativeResult =
    query.type === 'narrative' ? results[0] : query.type === 'all' ? results[1] : undefined

  const scoreOf = (h: NonNullable<TsResult['hits']>[number]) =>
    h.hybrid_search_info?.rank_fusion_score ?? h.text_match ?? null
  const storyHits = storyResult?.hits ?? []
  const narrativeHits = narrativeResult?.hits ?? []
  const storyIds = storyHits.map((h) => h.document.id)
  const narrativeIds = narrativeHits.map((h) => h.document.id)
  // Only what a hit shows: the full list items would cost seven queries.
  const [storyRows, publishers, counts, narrativeRows] = await Promise.all([
    storyIds.length
      ? db
          .select({
            id: schema.story.id,
            slug: schema.story.slug,
            title: schema.story.title,
            summary: schema.storySummaryVersion.body,
            lastUpdatedAt: schema.story.lastUpdatedAt,
            desk: schema.story.desk,
            regions: schema.story.regions,
          })
          .from(schema.story)
          .leftJoin(
            schema.storySummaryVersion,
            eq(schema.storySummaryVersion.id, schema.story.currentSummaryId),
          )
          .where(inArray(schema.story.id, storyIds))
      : [],
    publishersByStory(db, storyIds),
    sourceCounts(db, storyIds),
    narrativeIds.length
      ? db
          .select({
            id: schema.narrative.id,
            slug: schema.narrative.slug,
            title: schema.narrative.title,
            description: schema.narrative.description,
            updatedAt: schema.narrative.updatedAt,
            storyCount: sql<number>`count(${schema.story.id})::int`,
          })
          .from(schema.narrative)
          .leftJoin(
            schema.narrativeStory,
            and(
              eq(schema.narrativeStory.narrativeId, schema.narrative.id),
              isNull(schema.narrativeStory.removedAt),
            ),
          )
          .leftJoin(
            schema.story,
            and(
              eq(schema.story.id, schema.narrativeStory.storyId),
              isNotNull(schema.story.publishedAt),
            ),
          )
          .where(inArray(schema.narrative.id, narrativeIds))
          .groupBy(schema.narrative.id)
      : [],
  ])
  const storyById = new Map(storyRows.map((s) => [s.id, s]))
  const narrativeById = new Map(narrativeRows.map((n) => [n.id, n]))

  const hits: SearchHit[] = [
    ...narrativeHits.flatMap((h): SearchHit[] => {
      const n = narrativeById.get(h.document.id)
      if (!n) return []
      return [
        {
          type: 'narrative',
          id: n.id,
          slug: n.slug,
          title: n.title,
          description: n.description,
          updatedAt: n.updatedAt.toISOString(),
          storyCount: n.storyCount,
          score: scoreOf(h),
        },
      ]
    }),
    ...storyHits.flatMap((h): SearchHit[] => {
      const s = storyById.get(h.document.id)
      if (!s) return []
      return [
        {
          type: 'story',
          id: s.id,
          slug: s.slug,
          title: s.title,
          summary: s.summary,
          lastUpdatedAt: s.lastUpdatedAt.toISOString(),
          sourceCount: counts.get(s.id) ?? 0,
          publisherNames: (publishers.get(s.id) ?? []).map((p) => p.name),
          desk: s.desk,
          regions: s.regions,
          score: scoreOf(h),
        },
      ]
    }),
  ]
  return { query: query.q, mode: vector ? 'hybrid' : 'keyword', hits }
}
