import { countryFromHeader } from '@dn/domain'
import type { Region } from '@dn/schemas'
import { createServerFn } from '@tanstack/react-start'

interface SessionInfo {
  user: {
    id: string
    name: string
    email: string
    username: string | null
    isAdmin: boolean
    // False until onboarding is finished or skipped; the root route sends them there.
    onboarded: boolean
    // Saved preferences the app reads on most pages, so they don't need their own request.
    regions: Region[]
    rememberReads: boolean
  } | null
  // Saved preference, else the request's country (Cloudflare); null when neither is known.
  country: string | null
  features: { summaryEditing: boolean; googleSignIn: boolean }
  /** Public origin ("https://domino-wire.ndo.dev"), for absolute URLs in share tags. */
  origin: string
}

// Web-only convenience for route guards. API clients authenticate per request instead.
export const getSessionInfo = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionInfo> => {
    const { getPreferences, getServerContext } = await import('@dn/server')
    const { getRequestHeaders } = await import('@tanstack/react-start/server')
    const { requestSession } = await import('../server/api-bridge.ts')
    const ctx = getServerContext()
    const headers = getRequestHeaders()
    const session = await requestSession()
    const prefs = session ? await getPreferences(ctx.db, session.user.id) : null
    return {
      user: session
        ? {
            id: session.user.id,
            name: session.user.name,
            email: session.user.email,
            username: (session.user as { username?: string | null }).username ?? null,
            isAdmin: session.user.role === 'admin',
            onboarded: prefs?.onboarded ?? false,
            regions: prefs?.regions ?? [],
            rememberReads: prefs?.rememberReads ?? false,
          }
        : null,
      country: prefs?.country ?? countryFromHeader(headers.get('cf-ipcountry')),
      features: {
        summaryEditing: ctx.config.enableSummaryEditing,
        googleSignIn: ctx.config.googleSignIn,
      },
      // BETTER_AUTH_URL is the public origin in every deployment; the request is a fallback.
      origin:
        process.env.BETTER_AUTH_URL?.replace(/\/$/, '') ??
        `${headers.get('x-forwarded-proto') ?? 'http'}://${headers.get('host') ?? 'localhost:4000'}`,
    }
  },
)

// Only same-site paths: "//host" and absolute URLs would redirect off-site.
export function safeNext(next: string | undefined, fallback: string): string {
  return next?.startsWith('/') && !next.startsWith('//') ? next : fallback
}
