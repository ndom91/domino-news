// Server-only: runs the versioned API in-process for SSR, with the caller's cookies.
import { getServerContext } from '@dn/server'
import { handleApiRequest, type Session } from '@dn/server/api'
import { getRequest, getRequestHeaders } from '@tanstack/react-start/server'

// One session lookup per page request, shared by every in-process API call and the root
// route's session check. Keyed on the incoming Request, so it goes away with it.
const sessions = new WeakMap<Request, Promise<Session | null>>()

export function requestSession(): Promise<Session | null> {
  const request = getRequest()
  let session = sessions.get(request)
  if (!session) {
    session = getServerContext().auth.api.getSession({ headers: request.headers })
    sessions.set(request, session)
  }
  return session
}

export async function serverApiFetch(url: string, init: RequestInit | undefined) {
  const headers = getRequestHeaders()
  const forwarded = new Headers(init?.headers)
  const cookie = headers.get('cookie')
  if (cookie) forwarded.set('cookie', cookie)
  const authorization = headers.get('authorization')
  if (authorization) forwarded.set('authorization', authorization)
  // Set by Cloudflare in prod; picks the default country for lean mixes.
  const country = headers.get('cf-ipcountry')
  if (country) forwarded.set('cf-ipcountry', country)
  const request = new Request(new URL(url, 'http://ssr.internal'), { ...init, headers: forwarded })
  return handleApiRequest(getServerContext(), request, requestSession())
}
