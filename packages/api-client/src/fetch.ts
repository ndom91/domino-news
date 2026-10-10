// Structural fetch types so this package compiles without DOM or Node libs (React Native-safe).

export interface AbortSignalLike {
  readonly aborted: boolean
}

export interface FetchInit {
  method?: string
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignalLike
  credentials?: 'include' | 'omit' | 'same-origin'
}

export interface FetchResponse {
  readonly ok: boolean
  readonly status: number
  json(): Promise<unknown>
}

// Method syntax keeps parameters bivariant, so the platform `fetch` is assignable.
interface FetcherShape {
  fetch(url: string, init?: FetchInit): Promise<FetchResponse>
}
export type Fetcher = FetcherShape['fetch']
