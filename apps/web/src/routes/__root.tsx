/// <reference types="vite/client" />
import { TooltipProvider } from '@dn/ui'
import type { QueryClient } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  redirect,
  Scripts,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { SiteHeader } from '../components/site-header.tsx'
import { getSessionInfo } from '../lib/session.ts'
import appCss from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ location }) => {
    const session = await getSessionInfo()
    // The whole app sits behind login.
    if (!session.user && location.pathname !== '/login') {
      throw redirect({ to: '/login', search: { next: location.href } })
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
  return (
    <TooltipProvider>
      {session.user ? <SiteHeader user={session.user} /> : null}
      <main id="main">
        <Outlet />
      </main>
    </TooltipProvider>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-canvas text-text antialiased">
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
