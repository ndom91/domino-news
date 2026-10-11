import { ApiError, createApiClient } from '@dn/api-client'
import { createQueries } from '@dn/queries'
import { notFound } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

// Same client and query definitions everywhere. During SSR the fetcher calls the API
// handler in-process (no loopback HTTP); in the browser it is plain fetch.
const apiFetch = createIsomorphicFn()
  .server(async (url: string, init?: RequestInit) => {
    const { serverApiFetch } = await import('../server/api-bridge.ts')
    return serverApiFetch(url, init)
  })
  .client((url: string, init?: RequestInit) => fetch(url, init))

export const api = createApiClient({
  baseUrl: '',
  fetch: (url, init) => apiFetch(url, init as RequestInit),
})
export const queries = createQueries(api)

/** For loaders: an API 404 (a mistyped or removed slug) shows the global 404 page. */
export async function orNotFound<T>(load: Promise<T>): Promise<T> {
  try {
    return await load
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw notFound()
    throw error
  }
}
