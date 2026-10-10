import { createQueues, PriorityLimiter, type WorkerContext } from '@dn/jobs'
import { createServerContext, resetIngestedData, type Typesense } from '@dn/server'
import { PgBoss } from 'pg-boss'

/** In-memory stand-in for Typesense: enough for upserts, deletes and vector lookups. */
export function createFakeTypesense() {
  const collections = new Map<string, Map<string, Record<string, unknown>>>()
  const collRaw = (name: string) => {
    let c = collections.get(name)
    if (!c) {
      c = new Map()
      collections.set(name, c)
    }
    return c
  }
  const cosine = (a: number[], b: number[]) => {
    let dot = 0
    let na = 0
    let nb = 0
    for (let i = 0; i < a.length; i++) {
      dot += (a[i] ?? 0) * (b[i] ?? 0)
      na += (a[i] ?? 0) ** 2
      nb += (b[i] ?? 0) ** 2
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
  }
  const aliases = new Map<string, string>()
  const resolve = (name: string) => aliases.get(name) ?? name
  const coll = (name: string) => collRaw(resolve(name))
  const ts = {
    collections,
    aliases,
    // Minimal collection/alias API used by rebuildSearchIndex.
    request: async (
      method: string,
      path: string,
      body?: { name?: string; collection_name?: string },
    ) => {
      const alias = path.match(/^\/aliases\/(\w+)$/)?.[1]
      if (alias && method === 'GET') {
        const target = aliases.get(alias)
        if (!target) throw new Error('alias not found')
        return { collection_name: target } as never
      }
      if (alias && method === 'PUT') aliases.set(alias, body?.collection_name ?? '')
      if (path === '/collections' && method === 'POST' && body?.name) collRaw(body.name)
      const dropped = path.match(/^\/collections\/(\w+)$/)?.[1]
      if (dropped && method === 'DELETE') collections.delete(dropped)
      return {} as never
    },
    importDocuments: async (collection: string, docs: Record<string, unknown>[]) => {
      for (const doc of docs) coll(collection).set(String(doc.id), doc)
    },
    upsert: async (collection: string, doc: Record<string, unknown>) => {
      coll(collection).set(String(doc.id), doc)
      return doc
    },
    remove: async (collection: string, id: string) => {
      coll(collection).delete(id)
    },
    multiSearch: async (searches: Record<string, unknown>[]) => ({
      results: searches.map((s) => {
        const vq = String(s.vector_query ?? '')
        const match = vq.match(/\(\[(.*)\],/)
        const exclude = String(s.filter_by ?? '').match(/id:!=([\w-]+)/)?.[1]
        const docs = [...coll(String(s.collection)).values()].filter((d) => d.id !== exclude)
        if (!match?.[1]) return { hits: docs.map((document) => ({ document })) }
        const vector = match[1].split(',').map(Number)
        return {
          hits: docs
            .filter((d) => Array.isArray(d.embedding))
            .map((d) => ({
              document: d,
              vector_distance: 1 - cosine(vector, d.embedding as number[]),
            }))
            .sort((a, b) => a.vector_distance - b.vector_distance)
            .slice(0, 12),
        }
      }),
    }),
  }
  return ts as unknown as Typesense & { collections: typeof collections }
}

export async function createTestContext() {
  const base = createServerContext()
  const ts = createFakeTypesense()
  const workerBoss = new PgBoss({
    connectionString: base.config.databaseUrl,
    max: 3,
    supervise: false,
    schedule: false,
  })
  workerBoss.on('error', () => {})
  await workerBoss.start()
  await createQueues(workerBoss)
  const ctx: WorkerContext & { ts: ReturnType<typeof createFakeTypesense> } = {
    ...base,
    ts,
    boss: async () => workerBoss,
    workerBoss,
    gpu: { embeddings: new PriorityLimiter(2), generation: new PriorityLimiter(2) },
  }
  return {
    ctx,
    async close() {
      await workerBoss.stop({ graceful: false })
      await base.pool.end()
    },
  }
}

/** Removes all domain rows between tests (keeps the schema). */
export async function truncateAll(ctx: { pool: Parameters<typeof resetIngestedData>[0] }) {
  await resetIngestedData(ctx.pool, { includeSourcesAndAccounts: true })
}
