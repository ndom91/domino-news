const entries = new Map<string, { at: number; value: Promise<unknown> }>()

/**
 * Shares one result per key for `ttlMs`, including while it's still loading, so concurrent
 * requests run one query. Only for reads that don't depend on the reader and change only
 * when the pipeline runs (it lives in another process, so nothing here invalidates).
 */
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = entries.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>
  const value = load()
  entries.set(key, { at: Date.now(), value })
  // Don't keep a failure: the next caller retries.
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key)
  })
  return value
}

/** Tests change data between requests and must not see an earlier result. */
export function clearCache() {
  entries.clear()
}

// Pipeline output shows up within a minute.
export const SHARED_TTL_MS = 60_000
