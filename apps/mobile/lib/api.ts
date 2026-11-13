import { ApiError, createApiClient } from '@dn/api-client'
import { createQueries } from '@dn/queries'
import { authClient } from './auth-client'
import { apiUrl } from './config'
import { fetchJson } from './fetch-json'

export const api = createApiClient({
  baseUrl: apiUrl,
  fetch: (url, init) => fetchJson(url, init as RequestInit),
  credentials: 'omit',
  headers: async (): Promise<Record<string, string>> => {
    const cookie = await authClient.getCookie()
    return cookie ? { cookie } : {}
  },
})

export const queries = createQueries(api)

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'unauthorized'
}
