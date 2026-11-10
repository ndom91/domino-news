import {
  type ApiErrorCode,
  type AssessmentRequest,
  type AudioBriefingResult,
  apiErrorSchema,
  audioBriefingResultSchema,
  type BriefingResponse,
  briefingResponseSchema,
  type Edition,
  type EvidenceResponse,
  editionSchema,
  evidenceResponseSchema,
  type FailedJobsResponse,
  type FeedbackRequest,
  type FollowList,
  type FollowRequest,
  type ForYouResponse,
  type FrontPage,
  failedJobsResponseSchema,
  followListSchema,
  forYouResponseSchema,
  frontPageSchema,
  type HiddenStories,
  hiddenStoriesSchema,
  type Insights,
  insightsSchema,
  type LearnedSignals,
  type LocalFeedResponse,
  learnedSignalsSchema,
  localFeedResponseSchema,
  type MatchHealth,
  type MutedPublisherList,
  type MutedPublisherRequest,
  matchHealthSchema,
  mutedPublisherListSchema,
  type NarrativeDetail,
  type NarrativeListResponse,
  narrativeDetailSchema,
  narrativeListResponseSchema,
  type OpsAction,
  type OpsStatus,
  opsStatusSchema,
  type Preview,
  type PreviewType,
  type PublisherAssessment,
  type PublisherDetail,
  type PublisherListResponse,
  type PushSubscriptionRequest,
  type PushSubscriptionStatus,
  previewSchema,
  publisherAssessmentSchema,
  publisherDetailSchema,
  publisherListResponseSchema,
  pushSubscriptionStatusSchema,
  type Region,
  type SearchQuery,
  type SearchResponse,
  type SignalsRequest,
  type StoryDetail,
  type StoryListResponse,
  type StoryUpdatesResponse,
  type SummaryEditRequest,
  searchResponseSchema,
  storyDetailSchema,
  storyListResponseSchema,
  storyUpdatesResponseSchema,
  type UserPreferences,
  type UserPreferencesUpdate,
  userPreferencesSchema,
} from '@dn/schemas'
import { z } from 'zod/mini'
import type { AbortSignalLike, Fetcher, FetchResponse } from './fetch.ts'

export type { Fetcher }

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | 'network',
    message: string,
  ) {
    super(message)
  }
}

export interface ApiClientOptions {
  /** e.g. "https://news.example.com" (no trailing slash). Empty string = same origin. */
  baseUrl: string
  fetch: Fetcher
  /**
   * Extra headers per request. On native with @better-auth/expo, pass the session cookie:
   * `async () => ({ cookie: await authClient.getCookie() })`.
   */
  headers?: () => Record<string, string> | Promise<Record<string, string>>
  /** "include" (default) for browsers. Native sets "omit": it sends the cookie itself. */
  credentials?: 'include' | 'omit'
}

/** Typed client for /api/v1. Framework-free; works in browsers, Node and React Native. */
export function createApiClient({
  baseUrl,
  fetch,
  headers,
  credentials = 'include',
}: ApiClientOptions) {
  async function request<T>(
    schema: z.ZodMiniType<T>,
    path: string,
    init: { method?: string; body?: unknown; signal?: AbortSignalLike } = {},
  ): Promise<T> {
    let res: FetchResponse
    try {
      const extra = (await headers?.()) ?? {}
      res = await fetch(`${baseUrl}/api/v1${path}`, {
        method: init.method ?? 'GET',
        headers: {
          accept: 'application/json',
          ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...extra,
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: init.signal,
        credentials,
      })
    } catch (error) {
      throw new ApiError(0, 'network', String(error))
    }
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const parsed = apiErrorSchema.safeParse(json)
      throw parsed.success
        ? new ApiError(res.status, parsed.data.error.code, parsed.data.error.message)
        : new ApiError(res.status, 'internal', `request failed with ${res.status}`)
    }
    return schema.parse(json)
  }

  const qs = (params: Record<string, string | number | undefined | null>) => {
    const entries = Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== '',
    )
    return entries.length
      ? `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')}`
      : ''
  }

  return {
    getFrontPage: (opts: { region?: Region | null } = {}, signal?: AbortSignalLike) =>
      request<FrontPage>(frontPageSchema, `/front${qs({ region: opts.region })}`, { signal }),
    getBriefing: (signal?: AbortSignalLike) =>
      request<BriefingResponse>(briefingResponseSchema, '/briefing', { signal }),
    /** The reader's spoken briefing: a written script, then speech. Slow; the web streams it. */
    prepareAudioBriefing: (body: { timeZone?: string }, signal?: AbortSignalLike) =>
      request<AudioBriefingResult>(audioBriefingResultSchema, '/briefing/audio-prototype', {
        method: 'POST',
        body,
        signal,
      }),
    getEdition: (signal?: AbortSignalLike) =>
      request<Edition>(editionSchema, '/edition', { signal }),
    listStories: (
      opts: { cursor?: string | null; limit?: number; region?: Region | null } = {},
      signal?: AbortSignalLike,
    ) => request<StoryListResponse>(storyListResponseSchema, `/stories${qs(opts)}`, { signal }),
    getLocal: (opts: { cursor?: string | null; limit?: number } = {}, signal?: AbortSignalLike) =>
      request<LocalFeedResponse>(localFeedResponseSchema, `/local${qs(opts)}`, { signal }),
    getStory: (id: string, signal?: AbortSignalLike) =>
      request<StoryDetail>(storyDetailSchema, `/stories/${encodeURIComponent(id)}`, { signal }),
    getStoryUpdates: (id: string, signal?: AbortSignalLike) =>
      request<StoryUpdatesResponse>(
        storyUpdatesResponseSchema,
        `/stories/${encodeURIComponent(id)}/updates`,
        {
          signal,
        },
      ),
    editSummary: (id: string, body: SummaryEditRequest) =>
      request<StoryDetail>(storyDetailSchema, `/stories/${encodeURIComponent(id)}/summary`, {
        method: 'POST',
        body,
      }),
    listNarratives: (signal?: AbortSignalLike) =>
      request<NarrativeListResponse>(narrativeListResponseSchema, '/narratives', { signal }),
    getNarrative: (id: string, signal?: AbortSignalLike) =>
      request<NarrativeDetail>(narrativeDetailSchema, `/narratives/${encodeURIComponent(id)}`, {
        signal,
      }),
    getNarrativeUpdates: (id: string, signal?: AbortSignalLike) =>
      request<StoryUpdatesResponse>(
        storyUpdatesResponseSchema,
        `/narratives/${encodeURIComponent(id)}/updates`,
        { signal },
      ),
    search: (query: Partial<SearchQuery> & { q: string }, signal?: AbortSignalLike) =>
      request<SearchResponse>(searchResponseSchema, `/search${qs(query)}`, { signal }),
    listPublishers: (signal?: AbortSignalLike) =>
      request<PublisherListResponse>(publisherListResponseSchema, '/publishers', { signal }),
    getPublisher: (slug: string, signal?: AbortSignalLike) =>
      request<PublisherDetail>(publisherDetailSchema, `/publishers/${encodeURIComponent(slug)}`, {
        signal,
      }),
    /** Public: works without a session (share cards, signed-out teasers). */
    getPreview: (type: PreviewType, slug: string, signal?: AbortSignalLike) =>
      request<Preview>(previewSchema, `/previews/${type}/${encodeURIComponent(slug)}`, {
        signal,
      }),
    getOpsStatus: (signal?: AbortSignalLike) =>
      request<OpsStatus>(opsStatusSchema, '/ops/status', { signal }),
    getMatchHealth: (signal?: AbortSignalLike) =>
      request<MatchHealth>(matchHealthSchema, '/ops/match-health', { signal }),
    getFailedJobs: (
      query: { queue?: string | null; cursor?: string | null },
      signal?: AbortSignalLike,
    ) =>
      request<FailedJobsResponse>(failedJobsResponseSchema, `/ops/failed${qs(query)}`, { signal }),
    getPreferences: (signal?: AbortSignalLike) =>
      request<UserPreferences>(userPreferencesSchema, '/me/preferences', { signal }),
    savePreferences: (body: UserPreferencesUpdate) =>
      request<UserPreferences>(userPreferencesSchema, '/me/preferences', { method: 'POST', body }),
    recordRead: (storyId: string) =>
      request(z.object({ recorded: z.boolean() }), '/me/reads', {
        method: 'POST',
        body: { storyId },
      }),
    getEvidence: (slug: string, signal?: AbortSignalLike) =>
      request<EvidenceResponse>(
        evidenceResponseSchema,
        `/publishers/${encodeURIComponent(slug)}/evidence`,
        { signal },
      ),
    saveAssessment: (slug: string, body: AssessmentRequest) =>
      request<PublisherAssessment | null>(
        z.nullable(publisherAssessmentSchema),
        `/publishers/${encodeURIComponent(slug)}/assessment`,
        { method: 'POST', body },
      ),
    getFollows: (signal?: AbortSignalLike) =>
      request<FollowList>(followListSchema, '/me/follows', { signal }),
    setFollow: (body: FollowRequest) =>
      request<FollowList>(followListSchema, '/me/follows', { method: 'POST', body }),
    getMutedPublishers: (signal?: AbortSignalLike) =>
      request<MutedPublisherList>(mutedPublisherListSchema, '/me/muted-publishers', { signal }),
    setMutedPublisher: (body: MutedPublisherRequest) =>
      request<MutedPublisherList>(mutedPublisherListSchema, '/me/muted-publishers', {
        method: 'POST',
        body,
      }),
    getForYou: (opts: { cursor?: string | null; limit?: number } = {}, signal?: AbortSignalLike) =>
      request<ForYouResponse>(forYouResponseSchema, `/for-you${qs(opts)}`, { signal }),
    setFeedback: (body: FeedbackRequest) =>
      request<LearnedSignals>(learnedSignalsSchema, '/me/feedback', { method: 'POST', body }),
    savePushSubscription: (body: PushSubscriptionRequest) =>
      request<{ saved: boolean }>(z.object({ saved: z.boolean() }), '/me/push-subscriptions', {
        method: 'POST',
        body,
      }),
    getPushSubscriptionStatus: (token: string) =>
      request<PushSubscriptionStatus>(
        pushSubscriptionStatusSchema,
        `/me/push-subscriptions${qs({ token })}`,
      ),
    removePushSubscription: (token: string) =>
      request<{ removed: boolean }>(
        z.object({ removed: z.boolean() }),
        '/me/push-subscriptions/remove',
        { method: 'POST', body: { token } },
      ),
    getHiddenStories: (signal?: AbortSignalLike) =>
      request<HiddenStories>(hiddenStoriesSchema, '/me/hidden-stories', { signal }),
    getSignals: (signal?: AbortSignalLike) =>
      request<LearnedSignals>(learnedSignalsSchema, '/me/signals', { signal }),
    updateSignals: (body: SignalsRequest) =>
      request<LearnedSignals>(learnedSignalsSchema, '/me/signals', { method: 'POST', body }),
    getInsights: (signal?: AbortSignalLike) =>
      request<Insights>(insightsSchema, '/me/insights', { signal }),
    runOpsAction: (body: OpsAction) =>
      request(z.object({ ok: z.boolean(), count: z.optional(z.int()) }), '/ops/actions', {
        method: 'POST',
        body,
      }),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
