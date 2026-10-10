import { EMBEDDING_DIMENSIONS } from '@dn/db'

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
    health: () => request<{ ok: boolean }>('GET', '/health'),
    upsert: (collection: string, doc: Record<string, unknown>) =>
      request('POST', `/collections/${collection}/documents?action=upsert`, doc),
    remove: async (collection: string, id: string) => {
      try {
        await request('DELETE', `/collections/${collection}/documents/${encodeURIComponent(id)}`)
      } catch (error) {
        if (!(error instanceof TypesenseError && error.status === 404)) throw error
      }
    },
    multiSearch: <T>(searches: Record<string, unknown>[]) =>
      request<{ results: T[] }>('POST', '/multi_search', { searches }),
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
          { name: 'slug', type: 'string', index: false, optional: true },
          { name: 'title', type: 'string' },
          { name: 'summary', type: 'string', optional: true },
          { name: 'publisher_ids', type: 'string[]', facet: true },
          { name: 'publisher_names', type: 'string[]' },
          { name: 'narrative_ids', type: 'string[]', facet: true },
          { name: 'source_count', type: 'int32' },
          { name: 'last_updated_at', type: 'int64', sort: true },
          embedding,
        ],
        default_sorting_field: 'last_updated_at',
      }
    case 'narratives':
      return {
        name,
        fields: [
          { name: 'slug', type: 'string', index: false, optional: true },
          { name: 'title', type: 'string' },
          { name: 'description', type: 'string', optional: true },
          { name: 'story_count', type: 'int32' },
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
