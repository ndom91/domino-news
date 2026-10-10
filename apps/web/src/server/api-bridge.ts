// Server-only: runs the versioned API in-process for SSR, with the caller's cookies.
import { getServerContext } from '@dn/server'
import { handleApiRequest } from '@dn/server/api'
import { getRequestHeaders } from '@tanstack/react-start/server'

export async function serverApiFetch(url: string, init: RequestInit | undefined) {
  const headers = getRequestHeaders()
  const forwarded = new Headers(init?.headers)
  const cookie = headers.get('cookie')
  if (cookie) forwarded.set('cookie', cookie)
  const authorization = headers.get('authorization')
  if (authorization) forwarded.set('authorization', authorization)
  const request = new Request(new URL(url, 'http://ssr.internal'), { ...init, headers: forwarded })
  return handleApiRequest(getServerContext(), request)
}
