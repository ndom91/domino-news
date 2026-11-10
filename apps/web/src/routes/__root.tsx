/// <reference types="vite/client" />

import { archivoLatinUrl } from '@dn/design-tokens/fonts'
import { queryKeys } from '@dn/queries'
import { ToastProvider, TooltipProvider } from '@dn/ui'
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
import { seo } from '../lib/seo.ts'
import { PUBLIC_PATHS } from '../lib/seo-routes.ts'
import { getSessionInfo } from '../lib/session.ts'
import { themeScript } from '../lib/theme.ts'
import appCss from '../styles.css?url'

// Signed out, these show a teaser (title, one sentence, sign-in button) instead of redirecting,
// so shared links preview properly. The routes load public preview data when `preview` is set.
const PREVIEW_PATH = /^\/(stories|narratives|publishers)\/[^/]+\/?$/

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async ({ context, location }) => {
    // Cached for the visit: not refetched on every navigation and hover preload. Sign-in,
    // sign-out and preference saves invalidate it; fetchQuery then reloads it here.
    const session = await context.queryClient.fetchQuery({
      queryKey: queryKeys.session(),
      queryFn: () => getSessionInfo(),
      staleTime: Number.POSITIVE_INFINITY,
    })
    // The whole app sits behind login, apart from the public pages and share teasers.
    const preview = !session.user && PREVIEW_PATH.test(location.pathname)
    if (!session.user && !preview && !PUBLIC_PATHS.includes(location.pathname)) {
      throw redirect({ to: '/login', search: { next: location.href } })
    }
    // First visit: onboarding once, then back to where they were going.
    if (
      session.user &&
      !session.user.onboarded &&
      location.pathname !== '/onboarding' &&
      location.pathname !== '/delete-account' &&
      location.pathname !== '/contact-us'
    ) {
      throw redirect({ to: '/onboarding', search: { next: location.href } })
    }
    return { session, preview }
  },
  // The header strip; in the server HTML so it doesn't pop in after hydration.
  loader: async ({ context }) => {
    if (context.session.user) await context.queryClient.ensureQueryData(queries.edition())
  },
  // Site-wide defaults (noindex, default share card); pages override them with seo().
  head: ({ match }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      // The dark edition strip tops every page in both themes, so mobile browser chrome blends
      // with it. (One value: TanStack keeps one meta per name, so media variants would collapse.)
      { name: 'theme-color', content: '#121212' },
      ...seo({ origin: match.context.session.origin, path: match.pathname }).meta,
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
      // Name, icons and colours for Add to Home Screen (icons: scripts/app-icons.mjs). .json,
      // not .webmanifest: the production static server only knows the former's content type.
      { rel: 'manifest', href: '/manifest.json' },
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
    <ToastProvider>
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
    </ToastProvider>
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
        <script
          src="https://stats.ndo.dev/api/script.js"
          data-site-id="f51919953027"
          defer
          fetchPriority="low"
        />
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
