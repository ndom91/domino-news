import { ApiError } from '@dn/api-client'
import { QueryClient } from '@tanstack/react-query'

export function createMobileQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Native connectivity events can be stale after a network handoff or backgrounding.
        // Always attempt reads (including manual retries); fetchJson bounds stalled requests.
        networkMode: 'always',
        // 'always' disables this by default; keep recovery on a real reconnect.
        refetchOnReconnect: true,
        retry: (failures, error) =>
          !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 3,
      },
    },
  })
}
