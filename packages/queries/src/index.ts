import type { ApiClient } from '@dn/api-client'
import type {
  AssessmentRequest,
  FollowList,
  FollowRequest,
  Region,
  SearchQuery,
  SummaryEditRequest,
  UserPreferences,
  UserPreferencesUpdate,
} from '@dn/schemas'
import { infiniteQueryOptions, type QueryClient, queryOptions } from '@tanstack/react-query'

// Query keys and options shared by web (and later native). Each factory takes the
// platform's ApiClient so transport/auth stays a client concern.

export const queryKeys = {
  stories: () => ['stories'] as const,
  front: (region: Region | null = null) => ['front', region ?? 'all'] as const,
  storyList: (region: Region | null = null) => ['stories', 'list', region ?? 'all'] as const,
  story: (id: string) => ['stories', 'detail', id] as const,
  narratives: () => ['narratives'] as const,
  narrative: (id: string) => ['narratives', 'detail', id] as const,
  search: (query: Partial<SearchQuery> & { q: string }) => ['search', query] as const,
  publishers: () => ['publishers'] as const,
  publisher: (slug: string) => ['publishers', 'detail', slug] as const,
  ops: () => ['ops', 'status'] as const,
  preferences: () => ['me', 'preferences'] as const,
  insights: () => ['me', 'insights'] as const,
  follows: () => ['me', 'follows'] as const,
  forYou: () => ['for-you'] as const,
  evidence: (slug: string) => ['publishers', 'evidence', slug] as const,
}

export function createQueries(api: ApiClient) {
  return {
    front: (region: Region | null = null) =>
      queryOptions({
        queryKey: queryKeys.front(region),
        queryFn: ({ signal }) => api.getFrontPage({ region }, signal),
        staleTime: 30_000,
      }),
    storyList: (region: Region | null = null) =>
      infiniteQueryOptions({
        queryKey: queryKeys.storyList(region),
        queryFn: ({ pageParam, signal }) =>
          api.listStories({ cursor: pageParam, limit: 30, region }, signal),
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
    preferences: () =>
      queryOptions({
        queryKey: queryKeys.preferences(),
        queryFn: ({ signal }) => api.getPreferences(signal),
        staleTime: 5 * 60_000,
      }),
    evidence: (slug: string) =>
      queryOptions({
        queryKey: queryKeys.evidence(slug),
        queryFn: ({ signal }) => api.getEvidence(slug, signal),
      }),
    follows: () =>
      queryOptions({
        queryKey: queryKeys.follows(),
        queryFn: ({ signal }) => api.getFollows(signal),
        staleTime: 5 * 60_000,
      }),
    forYou: () =>
      infiniteQueryOptions({
        queryKey: queryKeys.forYou(),
        queryFn: ({ pageParam, signal }) => api.getForYou(pageParam, signal),
        initialPageParam: null as string | null,
        getNextPageParam: (last) => last.pageInfo.nextCursor,
        staleTime: 60_000,
      }),
    insights: () =>
      queryOptions({
        queryKey: queryKeys.insights(),
        queryFn: ({ signal }) => api.getInsights(signal),
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

export function editSummaryMutation(api: ApiClient, queryClient: QueryClient, storyId: string) {
  return {
    mutationFn: (body: SummaryEditRequest) => api.editSummary(storyId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.stories() })
    },
  }
}

export function savePreferencesMutation(api: ApiClient, queryClient: QueryClient) {
  return {
    mutationFn: (body: UserPreferencesUpdate) => api.savePreferences(body),
    onSuccess: async (prefs: UserPreferences) => {
      queryClient.setQueryData(queryKeys.preferences(), prefs)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.insights() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.forYou() }),
      ])
    },
  }
}

export function saveAssessmentMutation(api: ApiClient, queryClient: QueryClient, slug: string) {
  return {
    mutationFn: (body: AssessmentRequest) => api.saveAssessment(slug, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.publisher(slug) })
    },
  }
}

export function setFollowMutation(api: ApiClient, queryClient: QueryClient) {
  return {
    mutationFn: (body: FollowRequest) => api.setFollow(body),
    onSuccess: async (follows: FollowList) => {
      queryClient.setQueryData(queryKeys.follows(), follows)
      await queryClient.invalidateQueries({ queryKey: queryKeys.forYou() })
    },
  }
}
