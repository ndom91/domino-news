/// <reference types="vite/client" />

import { archivoLatinUrl } from '@dn/design-tokens/fonts'
import { queryKeys } from '@dn/queries'
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
import { NotFoundPage } from '../components/not-found.tsx'
import { PublicHeader, SiteFooter, SiteHeader } from '../components/site-header.tsx'
import { queries } from '../lib/api.ts'
import { getSessionInfo } from '../lib/session.ts'
import { themeScript } from '../lib/theme.ts'
import appCss from '../styles.css?url'

// Readable without an account: the imprint and privacy policy must be reachable by anyone.
const PUBLIC_PATHS = new Set(['/login', '/about', '/privacy', '/terms', '/imprint'])

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ context, location }) => {
    // Cached for the visit: not refetched on every navigation and hover preload. Sign-in,
    // sign-out and preference saves invalidate it; fetchQuery then reloads it here.
    const session = await context.queryClient.fetchQuery({
      queryKey: queryKeys.session(),
      queryFn: () => getSessionInfo(),
      staleTime: Number.POSITIVE_INFINITY,
    })
    // The whole app sits behind login, apart from the public pages.
    if (!session.user && !PUBLIC_PATHS.has(location.pathname)) {
      throw redirect({ to: '/login', search: { next: location.href } })
    }
    // First visit: onboarding once, then back to where they were going.
    if (session.user && !session.user.onboarded && location.pathname !== '/onboarding') {
      throw redirect({ to: '/onboarding', search: { next: location.href } })
    }
    return { session }
  },
  // The header strip; in the server HTML so it doesn't pop in after hydration.
  loader: async ({ context }) => {
    if (context.session.user) await context.queryClient.ensureQueryData(queries.edition())
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: 'Domino News' },
      { name: 'robots', content: 'noindex' },
    ],
    links: [
      // Start the font download with the CSS, not after it's parsed, so text rarely paints
      // in the fallback first. The Latin subset covers nearly all text. crossOrigin is
      // required for font preloads, even same-origin.
      {
        rel: 'preload',
        href: archivoLatinUrl,
        as: 'font',
        type: 'font/woff2',
        crossOrigin: 'anonymous',
      },
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
  // Global 404: unmatched URLs, and loaders that throw notFound() (see orNotFound).
  notFoundComponent: NotFoundPage,
})

function RootLayout() {
  const { session } = Route.useRouteContext()
  // Onboarding is a focused flow: its nav links would only redirect back to it.
  const { pathname } = useLocation()
  const user = pathname !== '/onboarding' ? session.user : null
  return (
    <TooltipProvider>
      {/* Block wrapper: as flex items, the header's mx-auto rows would shrink to fit. */}
      <div>
        {user ? (
          <SiteHeader user={user} />
        ) : !session.user && pathname !== '/login' ? (
          <PublicHeader />
        ) : null}
      </div>
      {/* flex-1 pins the footer to the bottom when the page is short. */}
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      {/* The login page has its own layout and links to the legal pages itself. */}
      {pathname !== '/login' && pathname !== '/onboarding' ? (
        <SiteFooter user={session.user} />
      ) : null}
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
