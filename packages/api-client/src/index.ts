import {
  type ApiErrorCode,
  apiErrorSchema,
  type FrontPage,
  frontPageSchema,
  type Insights,
  insightsSchema,
  type NarrativeDetail,
  type NarrativeListResponse,
  narrativeDetailSchema,
  narrativeListResponseSchema,
  type OpsAction,
  type OpsStatus,
  opsStatusSchema,
  type PublisherDetail,
  type PublisherListResponse,
  publisherDetailSchema,
  publisherListResponseSchema,
  type Region,
  type SearchQuery,
  type SearchResponse,
  type StoryDetail,
  type StoryListResponse,
  type SummaryEditRequest,
  searchResponseSchema,
  storyDetailSchema,
  storyListResponseSchema,
  type UserPreferences,
  type UserPreferencesUpdate,
  userPreferencesSchema,
} from '@dn/schemas'
import { z } from 'zod'
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
  /** Extra headers per request, e.g. `authorization: Bearer <token>` on native. */
  headers?: () => Record<string, string>
}

/** Typed client for /api/v1. Framework-free; works in browsers, Node and React Native. */
export function createApiClient({ baseUrl, fetch, headers }: ApiClientOptions) {
  async function request<T>(
    schema: z.ZodType<T>,
    path: string,
    init: { method?: string; body?: unknown; signal?: AbortSignalLike } = {},
  ): Promise<T> {
    let res: FetchResponse
    try {
      res = await fetch(`${baseUrl}/api/v1${path}`, {
        method: init.method ?? 'GET',
        headers: {
          accept: 'application/json',
          ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...headers?.(),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: init.signal,
        credentials: 'include',
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
    listStories: (
      opts: { cursor?: string | null; limit?: number; region?: Region | null } = {},
      signal?: AbortSignalLike,
    ) => request<StoryListResponse>(storyListResponseSchema, `/stories${qs(opts)}`, { signal }),
    getStory: (id: string, signal?: AbortSignalLike) =>
      request<StoryDetail>(storyDetailSchema, `/stories/${encodeURIComponent(id)}`, { signal }),
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
    search: (query: Partial<SearchQuery> & { q: string }, signal?: AbortSignalLike) =>
      request<SearchResponse>(searchResponseSchema, `/search${qs(query)}`, { signal }),
    listPublishers: (signal?: AbortSignalLike) =>
      request<PublisherListResponse>(publisherListResponseSchema, '/publishers', { signal }),
    getPublisher: (slug: string, signal?: AbortSignalLike) =>
      request<PublisherDetail>(publisherDetailSchema, `/publishers/${encodeURIComponent(slug)}`, {
        signal,
      }),
    getOpsStatus: (signal?: AbortSignalLike) =>
      request<OpsStatus>(opsStatusSchema, '/ops/status', { signal }),
    getPreferences: (signal?: AbortSignalLike) =>
      request<UserPreferences>(userPreferencesSchema, '/me/preferences', { signal }),
    savePreferences: (body: UserPreferencesUpdate) =>
      request<UserPreferences>(userPreferencesSchema, '/me/preferences', { method: 'POST', body }),
    recordRead: (storyId: string) =>
      request(z.object({ recorded: z.boolean() }), '/me/reads', {
        method: 'POST',
        body: { storyId },
      }),
    getInsights: (signal?: AbortSignalLike) =>
      request<Insights>(insightsSchema, '/me/insights', { signal }),
    runOpsAction: (action: OpsAction['action']) =>
      request(z.object({ ok: z.boolean() }), '/ops/actions', { method: 'POST', body: { action } }),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
