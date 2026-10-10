import { createServerFn } from '@tanstack/react-start'

export interface SessionInfo {
  user: { id: string; name: string; username: string | null; isAdmin: boolean } | null
  features: { summaryEditing: boolean; googleSignIn: boolean }
}

// Web-only convenience for route guards. API clients authenticate per request instead.
export const getSessionInfo = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionInfo> => {
    const { getServerContext } = await import('@dn/server')
    const { getRequestHeaders } = await import('@tanstack/react-start/server')
    const ctx = getServerContext()
    const session = await ctx.auth.api.getSession({ headers: getRequestHeaders() })
    return {
      user: session
        ? {
            id: session.user.id,
            name: session.user.name,
            username: (session.user as { username?: string | null }).username ?? null,
            isAdmin: session.user.role === 'admin',
          }
        : null,
      features: {
        summaryEditing: ctx.config.enableSummaryEditing,
        googleSignIn: ctx.config.googleSignIn,
      },
    }
  },
)
