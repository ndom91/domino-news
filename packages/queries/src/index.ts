import type { ApiClient } from '@dn/api-client'
import type { SearchQuery, SummaryEditRequest } from '@dn/schemas'
import { infiniteQueryOptions, type QueryClient, queryOptions } from '@tanstack/react-query'

// Query keys and options shared by web (and later native). Each factory takes the
// platform's ApiClient so transport/auth stays a client concern.

export const queryKeys = {
  stories: () => ['stories'] as const,
  storyList: () => ['stories', 'list'] as const,
  story: (id: string) => ['stories', 'detail', id] as const,
  narratives: () => ['narratives'] as const,
  narrative: (id: string) => ['narratives', 'detail', id] as const,
  search: (query: Partial<SearchQuery> & { q: string }) => ['search', query] as const,
  publishers: () => ['publishers'] as const,
  publisher: (slug: string) => ['publishers', 'detail', slug] as const,
  ops: () => ['ops', 'status'] as const,
}

export function createQueries(api: ApiClient) {
  return {
    storyList: () =>
      infiniteQueryOptions({
        queryKey: queryKeys.storyList(),
        queryFn: ({ pageParam, signal }) =>
          api.listStories({ cursor: pageParam, limit: 30 }, signal),
        initialPageParam: null as string | null,
        getNextPageParam: (last) => last.pageInfo.nextCursor,
        staleTime: 30_000,
      }),
    story: (id: string) =>
      queryOptions({
        queryKey: queryKeys.story(id),
        queryFn: ({ signal }) => api.getStory(id, signal),
        staleTime: 30_000,
      }),
    narratives: () =>
      queryOptions({
        queryKey: queryKeys.narratives(),
        queryFn: ({ signal }) => api.listNarratives(signal),
        staleTime: 60_000,
      }),
    narrative: (id: string) =>
      queryOptions({
        queryKey: queryKeys.narrative(id),
        queryFn: ({ signal }) => api.getNarrative(id, signal),
        staleTime: 60_000,
      }),
    search: (query: Partial<SearchQuery> & { q: string }) =>
      queryOptions({
        queryKey: queryKeys.search(query),
        queryFn: ({ signal }) => api.search(query, signal),
        enabled: query.q.trim().length > 0,
        staleTime: 30_000,
      }),
    publishers: () =>
      queryOptions({
        queryKey: queryKeys.publishers(),
        queryFn: ({ signal }) => api.listPublishers(signal),
        staleTime: 10 * 60_000,
      }),
    publisher: (slug: string) =>
      queryOptions({
        queryKey: queryKeys.publisher(slug),
        queryFn: ({ signal }) => api.getPublisher(slug, signal),
        staleTime: 60_000,
      }),
    ops: () =>
      queryOptions({
        queryKey: queryKeys.ops(),
        queryFn: ({ signal }) => api.getOpsStatus(signal),
        refetchInterval: 5_000,
      }),
  }
}

export type Queries = ReturnType<typeof createQueries>

export function editSummaryMutation(api: ApiClient, queryClient: QueryClient, storyId: string) {
  return {
    mutationFn: (body: SummaryEditRequest) => api.editSummary(storyId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.stories() })
    },
  }
}
