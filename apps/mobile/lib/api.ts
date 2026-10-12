import { ApiError, createApiClient } from '@dn/api-client'
import { createQueries } from '@dn/queries'
import { authClient } from './auth-client'
import { apiUrl } from './config'

export const api = createApiClient({
  baseUrl: apiUrl,
  fetch: (url, init) => fetch(url, init as Parameters<typeof fetch>[1]),
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
