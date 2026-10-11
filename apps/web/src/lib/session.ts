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
  } | null
  features: { summaryEditing: boolean; googleSignIn: boolean }
}

// Web-only convenience for route guards. API clients authenticate per request instead.
export const getSessionInfo = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionInfo> => {
    const { getPreferences, getServerContext } = await import('@dn/server')
    const { getRequestHeaders } = await import('@tanstack/react-start/server')
    const ctx = getServerContext()
    const session = await ctx.auth.api.getSession({ headers: getRequestHeaders() })
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
          }
        : null,
      features: {
        summaryEditing: ctx.config.enableSummaryEditing,
        googleSignIn: ctx.config.googleSignIn,
      },
    }
  },
)

// Only same-site paths: "//host" and absolute URLs would redirect off-site.
export function safeNext(next: string | undefined, fallback: string): string {
  return next?.startsWith('/') && !next.startsWith('//') ? next : fallback
}
