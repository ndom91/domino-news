import { ApiError } from '@dn/api-client'
import { Button } from '@dn/ui'
import { QueryClient } from '@tanstack/react-query'
import { createRouter, Link, useRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Retry once, but not a 4xx: a missing slug should 404 at once, not after a retry.
        retry: (count, error) =>
          count < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
        refetchOnWindowFocus: false,
      },
    },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    // Always run loaders on preload; Query's staleTime decides whether they fetch.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    defaultErrorComponent: ({ error }) => <RouteError error={error as Error} />,
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

function RouteError({ error }: { error: Error }) {
  const router = useRouter()
  return (
    <div className="mx-auto max-w-page px-gutter py-16">
      <h1 className="type-section">This page could not be loaded</h1>
      <p className="mt-3 max-w-reading text-base text-text-secondary">
        Something went wrong while loading it. Try again, or go back to the front page.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        {/* invalidate() reruns the loaders and clears the error boundary. */}
        <Button size="sm" variant="primary" onClick={() => router.invalidate()}>
          Try again
        </Button>
        <Link to="/" className="link-inline font-semibold">
          Front page
        </Link>
      </div>
      <p className="mt-8 type-meta">Details: {error.message}</p>
    </div>
  )
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
