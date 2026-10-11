/// <reference types="vite/client" />
import { TooltipProvider } from '@dn/ui'
import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  redirect,
  Scripts,
  useLocation,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { SiteFooter, SiteHeader } from '../components/site-header.tsx'
import { getSessionInfo } from '../lib/session.ts'
import { themeScript } from '../lib/theme.ts'
import appCss from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ location }) => {
    const session = await getSessionInfo()
    // The whole app sits behind login.
    if (!session.user && location.pathname !== '/login') {
      throw redirect({ to: '/login', search: { next: location.href } })
    }
    // First visit: onboarding once, then back to where they were going.
    if (session.user && !session.user.onboarded && location.pathname !== '/onboarding') {
      throw redirect({ to: '/onboarding', search: { next: location.href } })
    }
    return { session }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'Domino News' },
      { name: 'robots', content: 'noindex' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: () => (
    <div className="mx-auto max-w-page px-gutter py-16">
      <h1 className="type-section">Page not found</h1>
      <p className="mt-3 text-base text-text-muted">
        The link may be out of date. Try the front page or search.
      </p>
    </div>
  ),
})

function RootLayout() {
  const { session } = Route.useRouteContext()
  // Onboarding is a focused flow: its nav links would only redirect back to it.
  const { pathname } = useLocation()
  const chrome = Boolean(session.user) && pathname !== '/onboarding'
  return (
    <TooltipProvider>
      {/* Block wrapper: as flex items, the header's mx-auto rows would shrink to fit. */}
      <div>{chrome && session.user ? <SiteHeader user={session.user} /> : null}</div>
      {/* flex-1 pins the footer to the bottom when the page is short. */}
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      {chrome && session.user ? <SiteFooter user={session.user} /> : null}
    </TooltipProvider>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    // The theme script sets data-theme before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static script, no user input */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body className="flex min-h-dvh flex-col bg-canvas text-text antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-text focus:px-3 focus:py-2 focus:text-canvas"
        >
          Skip to content
        </a>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
