import { ApiError } from '@dn/api-client'

/** Bound the complete JSON response, including a body that stalls after headers arrive. */
export async function fetchJson(
  url: string,
  init?: RequestInit,
  // Briefing generation allows 120s for the script, 180s for speech, plus response transfer.
  timeoutMs = url.endsWith('/api/v1/briefing/audio-prototype') ? 330_000 : 20_000,
) {
  const controller = new AbortController()
  const cancel = () => controller.abort()
  const signal = init?.signal
  if (signal?.aborted) cancel()
  signal?.addEventListener('abort', cancel)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal })
        const body = await response.json().catch(() => null)
        return { ok: response.ok, status: response.status, json: async () => body }
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new ApiError(408, 'network', 'The request took too long. Please try again.'))
          controller.abort()
        }, timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', cancel)
  }
}
