import type { ApiClient } from '@dn/api-client'
import type {
  AssessmentRequest,
  FeedbackRequest,
  FollowList,
  FollowRequest,
  LearnedSignals,
  MutedPublisherList,
  MutedPublisherRequest,
  PreviewType,
  Region,
  SearchQuery,
  SignalsRequest,
  SummaryEditRequest,
  UserPreferences,
  UserPreferencesUpdate,
} from '@dn/schemas'
import { infiniteQueryOptions, type QueryClient, queryOptions } from '@tanstack/react-query'

// Query keys and options shared by web (and later native). Each factory takes the
// platform's ApiClient so transport/auth stays a client concern.

export const queryKeys = {
  // Web caches its session info here (user plus a few preferences); see savePreferencesMutation.
  session: () => ['session'] as const,
  stories: () => ['stories'] as const,
  edition: () => ['edition'] as const,
  fronts: () => ['front'] as const,
  briefing: () => ['briefing'] as const,
  local: () => ['local'] as const,
  front: (region: Region | null = null) => ['front', region ?? 'all'] as const,
  storyList: (region: Region | null = null) => ['stories', 'list', region ?? 'all'] as const,
  story: (id: string) => ['stories', 'detail', id] as const,
  storyUpdates: (id: string) => ['stories', 'updates', id] as const,
  narratives: () => ['narratives'] as const,
  narrative: (id: string) => ['narratives', 'detail', id] as const,
  narrativeUpdates: (id: string) => ['narratives', 'updates', id] as const,
  search: (query: Partial<SearchQuery> & { q: string }) => ['search', query] as const,
  publishers: () => ['publishers'] as const,
  publisher: (slug: string) => ['publishers', 'detail', slug] as const,
  preview: (type: PreviewType, slug: string) => ['preview', type, slug] as const,
  ops: () => ['ops', 'status'] as const,
  matchHealth: () => ['ops', 'match-health'] as const,
  failedJobs: (queue: string | null) => ['ops', 'failed', queue ?? 'all'] as const,
  preferences: () => ['me', 'preferences'] as const,
  insights: () => ['me', 'insights'] as const,
  follows: () => ['me', 'follows'] as const,
  mutedPublishers: () => ['me', 'muted-publishers'] as const,
  forYou: () => ['for-you'] as const,
  forYouRail: () => ['for-you', 'rail'] as const,
  hiddenStories: () => ['me', 'hidden-stories'] as const,
  signals: () => ['me', 'signals'] as const,
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
    briefing: () =>
      queryOptions({
        queryKey: queryKeys.briefing(),
        queryFn: ({ signal }) => api.getBriefing(signal),
        staleTime: 60_000,
      }),
    local: () =>
      infiniteQueryOptions({
        queryKey: queryKeys.local(),
        queryFn: ({ pageParam, signal }) => api.getLocal({ cursor: pageParam, limit: 30 }, signal),
        initialPageParam: null as string | null,
        getNextPageParam: (last) => last.pageInfo.nextCursor,
        staleTime: 30_000,
      }),
    edition: () =>
      queryOptions({
        queryKey: queryKeys.edition(),
        queryFn: ({ signal }) => api.getEdition(signal),
        staleTime: 60_000,
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
        // Context is written on first read; poll until it is ready or has failed.
        refetchInterval: (query) =>
          query.state.data?.enrichment?.context === 'pending' ? 15_000 : false,
      }),
    storyUpdates: (id: string) =>
      queryOptions({
        queryKey: queryKeys.storyUpdates(id),
        queryFn: ({ signal }) => api.getStoryUpdates(id, signal),
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
    narrativeUpdates: (id: string) =>
      queryOptions({
        queryKey: queryKeys.narrativeUpdates(id),
        queryFn: ({ signal }) => api.getNarrativeUpdates(id, signal),
        staleTime: 30_000,
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
    preview: (type: PreviewType, slug: string) =>
      queryOptions({
        queryKey: queryKeys.preview(type, slug),
        queryFn: ({ signal }) => api.getPreview(type, slug, signal),
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
    mutedPublishers: () =>
      queryOptions({
        queryKey: queryKeys.mutedPublishers(),
        queryFn: ({ signal }) => api.getMutedPublishers(signal),
        staleTime: 5 * 60_000,
      }),
    forYou: () =>
      infiniteQueryOptions({
        queryKey: queryKeys.forYou(),
        queryFn: ({ pageParam, signal }) => api.getForYou({ cursor: pageParam }, signal),
        initialPageParam: null as string | null,
        getNextPageParam: (last) => last.pageInfo.nextCursor,
        staleTime: 60_000,
      }),
    // The front page rail shows 4; one spare in case the lead is among them.
    forYouRail: () =>
      queryOptions({
        queryKey: queryKeys.forYouRail(),
        queryFn: ({ signal }) => api.getForYou({ limit: 5 }, signal),
        staleTime: 60_000,
      }),
    hiddenStories: () =>
      queryOptions({
        queryKey: queryKeys.hiddenStories(),
        queryFn: ({ signal }) => api.getHiddenStories(signal),
      }),
    signals: () =>
      queryOptions({
        queryKey: queryKeys.signals(),
        queryFn: ({ signal }) => api.getSignals(signal),
        staleTime: 5 * 60_000,
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
        refetchInterval: 30_000,
      }),
    // Computed on the server and cached there for 5 minutes; no need to poll faster.
    matchHealth: () =>
      queryOptions({
        queryKey: queryKeys.matchHealth(),
        queryFn: ({ signal }) => api.getMatchHealth(signal),
        staleTime: 5 * 60_000,
        refetchInterval: 5 * 60_000,
      }),
    failedJobs: (queue: string | null) =>
      infiniteQueryOptions({
        queryKey: queryKeys.failedJobs(queue),
        queryFn: ({ pageParam, signal }) => api.getFailedJobs({ queue, cursor: pageParam }, signal),
        initialPageParam: null as string | null,
        getNextPageParam: (last) => last.pageInfo.nextCursor,
      }),
  }
}

export function editSummaryMutation(api: ApiClient, queryClient: QueryClient, storyId: string) {
  return {
    mutationFn: (body: SummaryEditRequest) => api.editSummary(storyId, body),
    onSuccess: async () => {
      // The front page embeds the lead Story's summary.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.stories() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.fronts() }),
      ])
    },
  }
}

export function savePreferencesMutation(api: ApiClient, queryClient: QueryClient) {
  return {
    mutationFn: (body: UserPreferencesUpdate) => api.savePreferences(body),
    onSuccess: async (prefs: UserPreferences) => {
      queryClient.setQueryData(queryKeys.preferences(), prefs)
      // The front page lead prefers the reader's regions.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.session() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.insights() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.forYou() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.briefing() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.local() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.fronts() }),
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.briefing() })
    },
  }
}

export function setMutedPublisherMutation(api: ApiClient, queryClient: QueryClient) {
  return {
    mutationFn: (body: MutedPublisherRequest) => api.setMutedPublisher(body),
    onSuccess: async (muted: MutedPublisherList) => {
      queryClient.setQueryData(queryKeys.mutedPublishers(), muted)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.forYou() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.briefing() }),
      ])
    },
  }
}

/**
 * "More / less like this". The For You list is not refetched here, so a hidden card can
 * show its undo notice in place; it re-ranks on the next visit.
 */
export function feedbackMutation(api: ApiClient, queryClient: QueryClient) {
  return {
    mutationFn: (body: FeedbackRequest) => api.setFeedback(body),
    onSuccess: async (signals: LearnedSignals) => {
      queryClient.setQueryData(queryKeys.signals(), signals)
      await queryClient.invalidateQueries({ queryKey: queryKeys.hiddenStories() })
    },
  }
}

export function updateSignalsMutation(api: ApiClient, queryClient: QueryClient) {
  return {
    mutationFn: (body: SignalsRequest) => api.updateSignals(body),
    onSuccess: async (signals: LearnedSignals) => {
      queryClient.setQueryData(queryKeys.signals(), signals)
      await queryClient.invalidateQueries({ queryKey: queryKeys.forYou() })
    },
  }
}
