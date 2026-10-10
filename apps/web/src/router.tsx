import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultErrorComponent: ({ error }) => <RouteError error={error as Error} />,
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

function RouteError({ error }: { error: Error }) {
  return (
    <div className="mx-auto max-w-page px-gutter py-16">
      <p className="type-section">This page could not be loaded</p>
      <p className="mt-3 text-base text-text-muted">{error.message}</p>
    </div>
  )
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
