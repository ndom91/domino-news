import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { ApiError, createApiClient } from '@dn/api-client'
import { fetchJson } from '../apps/mobile/lib/fetch-json.ts'

describe('mobile JSON request deadline', () => {
  it('returns a successful JSON response', async () => {
    const stub = mock.method(globalThis, 'fetch', async () => Response.json({ value: 1 }))
    try {
      const response = await fetchJson('https://example.test')
      assert.equal(response.ok, true)
      assert.deepEqual(await response.json(), { value: 1 })
    } finally {
      stub.mock.restore()
    }
  })

  for (const phase of ['headers', 'body']) {
    it(`ends a request stalled at ${phase}, even if native fetch ignores abort`, async () => {
      let signal: AbortSignal | undefined
      const stub = mock.method(globalThis, 'fetch', async (_url, init) => {
        signal = init?.signal as AbortSignal
        if (phase === 'headers') return new Promise<Response>(() => {})
        return { ok: true, status: 200, json: () => new Promise(() => {}) } as Response
      })
      try {
        await assert.rejects(fetchJson('https://example.test', undefined, 10), (error: unknown) => {
          assert.ok(error instanceof Error)
          // Existing mobile retry policy stops on 4xx: the deadline is not retried three times.
          assert.equal((error as ApiError).status, 408)
          assert.equal((error as ApiError).code, 'network')
          return true
        })
        assert.equal(signal?.aborted, true)
      } finally {
        stub.mock.restore()
      }
    })
  }

  it('preserves a transport timeout so the mobile retry policy can stop', async () => {
    const timeout = new ApiError(408, 'network', 'The request took too long.')
    const api = createApiClient({
      baseUrl: '',
      fetch: async () => {
        throw timeout
      },
    })
    await assert.rejects(api.getStory('test'), (error) => error === timeout)
  })

  it('forwards query cancellation to the native request', async () => {
    const controller = new AbortController()
    let signal: AbortSignal | undefined
    const stub = mock.method(globalThis, 'fetch', async (_url, init) => {
      signal = init?.signal as AbortSignal
      return new Promise<Response>((_, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    })
    try {
      const result = fetchJson('https://example.test', { signal: controller.signal })
      controller.abort()
      await assert.rejects(result, /aborted/)
      assert.equal(signal?.aborted, true)
    } finally {
      stub.mock.restore()
    }
  })
})
