import { EMBEDDING_DIMENSIONS } from '@dn/schemas'

/** Minimal Typesense REST client: only the calls this app needs. */
export function createTypesense(baseUrl: string, apiKey: string) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'x-typesense-api-key': apiKey, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      throw new TypesenseError(res.status, `${method} ${path}: ${res.status} ${await res.text()}`)
    }
    return (await res.json()) as T
  }
  return {
    request,
    upsert: (collection: string, doc: Record<string, unknown>) =>
      request('POST', `/collections/${collection}/documents?action=upsert`, doc),
    /** Bulk upsert (JSONL import). Throws if any document fails. */
    importDocuments: async (collection: string, docs: Record<string, unknown>[]) => {
      if (docs.length === 0) return
      const res = await fetch(
        `${baseUrl.replace(/\/$/, '')}/collections/${collection}/documents/import?action=upsert`,
        {
          method: 'POST',
          headers: { 'x-typesense-api-key': apiKey, 'content-type': 'text/plain' },
          body: docs.map((d) => JSON.stringify(d)).join('\n'),
          signal: AbortSignal.timeout(60_000),
        },
      )
      if (!res.ok) throw new TypesenseError(res.status, `import ${collection}: ${await res.text()}`)
      const failed = (await res.text())
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { success: boolean; error?: string })
        .find((r) => !r.success)
      if (failed) throw new TypesenseError(400, `import ${collection}: ${failed.error}`)
    },
    remove: async (collection: string, id: string) => {
      try {
        await request('DELETE', `/collections/${collection}/documents/${encodeURIComponent(id)}`)
      } catch (error) {
        if (!(error instanceof TypesenseError && error.status === 404)) throw error
      }
    },
    // multi_search answers 200 even when individual searches fail; surface those failures.
    multiSearch: async <T>(searches: Record<string, unknown>[]) => {
      const body = await request<{ results: (T & { error?: string; code?: number })[] }>(
        'POST',
        '/multi_search',
        { searches },
      )
      const failed = body.results.find((r) => r.error)
      if (failed) throw new TypesenseError(failed.code ?? 500, `multi_search: ${failed.error}`)
      return body as { results: T[] }
    },
  }
}

export type Typesense = ReturnType<typeof createTypesense>

export class TypesenseError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

// Collections are versioned and reached through aliases, so a rebuild can
// populate a fresh collection and then swap the alias.
export const ALIASES = ['stories', 'narratives', 'articles'] as const
export type Alias = (typeof ALIASES)[number]

const embedding = {
  name: 'embedding',
  type: 'float[]',
  num_dim: EMBEDDING_DIMENSIONS,
  optional: true,
}

export function collectionSchema(alias: Alias, name: string) {
  switch (alias) {
    case 'stories':
      return {
        name,
        fields: [
          { name: 'title', type: 'string' },
          { name: 'summary', type: 'string', optional: true },
          { name: 'publisher_ids', type: 'string[]', facet: true },
          { name: 'publisher_names', type: 'string[]' },
          { name: 'regions', type: 'string[]', facet: true, optional: true },
          { name: 'last_updated_at', type: 'int64', sort: true },
          embedding,
        ],
        default_sorting_field: 'last_updated_at',
      }
    case 'narratives':
      return {
        name,
        fields: [
          { name: 'title', type: 'string' },
          { name: 'description', type: 'string', optional: true },
          { name: 'updated_at', type: 'int64', sort: true },
        ],
        default_sorting_field: 'updated_at',
      }
    case 'articles':
      // Approved metadata only (title/description), never article bodies.
      return {
        name,
        fields: [
          { name: 'title', type: 'string' },
          { name: 'description', type: 'string', optional: true },
          { name: 'publisher_id', type: 'string', facet: true },
          { name: 'published_at', type: 'int64', sort: true },
          embedding,
        ],
        default_sorting_field: 'published_at',
      }
  }
}

export async function createCollection(ts: Typesense, alias: Alias) {
  const name = `${alias}_${Date.now()}`
  await ts.request('POST', '/collections', collectionSchema(alias, name))
  return name
}

export async function pointAlias(ts: Typesense, alias: Alias, collection: string) {
  const previous = await ts
    .request<{ collection_name: string }>('GET', `/aliases/${alias}`)
    .then((a) => a.collection_name)
    .catch(() => null)
  await ts.request('PUT', `/aliases/${alias}`, { collection_name: collection })
  return previous
}

/** Make sure every alias points at a collection (first run). */
export async function ensureCollections(ts: Typesense) {
  for (const alias of ALIASES) {
    const exists = await ts
      .request('GET', `/aliases/${alias}`)
      .then(() => true)
      .catch(() => false)
    if (!exists) await pointAlias(ts, alias, await createCollection(ts, alias))
  }
}

/** The k documents nearest to `vector`, as cosine similarity (1 - vector distance). */
export async function nearestByVector(
  ts: Typesense,
  collection: Alias,
  vector: number[],
  opts: { k: number; filter: string },
) {
  const { results } = await ts.multiSearch<{
    hits?: { document: { id: string }; vector_distance?: number }[]
  }>([
    {
      collection,
      q: '*',
      vector_query: `embedding:([${vector.join(',')}], k:${opts.k})`,
      filter_by: opts.filter,
      include_fields: 'id',
      per_page: opts.k,
    },
  ])
  return (results[0]?.hits ?? []).map((h) => ({
    id: h.document.id,
    similarity: 1 - (h.vector_distance ?? 1),
  }))
}
