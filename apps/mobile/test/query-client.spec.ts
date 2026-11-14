/// <reference types="node" />

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { ApiError } from '@dn/api-client'
import { focusManager, onlineManager, QueryObserver } from '@tanstack/react-query'
import { fetchJson } from '../lib/fetch-json.ts'
import { createMobileQueryClient } from '../lib/query-client.ts'

describe('mobile query recovery', { timeout: 2000 }, () => {
  let client: ReturnType<typeof createMobileQueryClient>

  beforeEach(() => {
    client = createMobileQueryClient()
    client.mount()
    focusManager.setFocused(true)
    // A lost native reconnect notification must not prevent an actual API request.
    onlineManager.setOnline(false)
  })

  afterEach(() => {
    client.unmount()
    client.clear()
    onlineManager.setOnline(true)
    focusManager.setFocused(undefined)
    mock.restoreAll()
  })

  it('loads an uncached story while the native connectivity signal says offline', async () => {
    const queryFn = mock.fn(async () => ({ id: 'story' }))
    const observer = new QueryObserver(client, { queryKey: ['story'], queryFn })
    const unsubscribe = observer.subscribe(() => {})
    try {
      assert.equal(queryFn.mock.callCount(), 1)
      assert.equal(observer.getCurrentResult().fetchStatus, 'fetching')
      const result = await observer.refetch()
      assert.deepEqual(result.data, { id: 'story' })
      assert.equal(queryFn.mock.callCount(), 1)
    } finally {
      unsubscribe()
    }
  })

  it('times out a stalled request, then sends a fresh request on Try again without a reconnect', async () => {
    let attempts = 0
    const transport = mock.method(globalThis, 'fetch', async () => {
      if (++attempts === 1) return new Promise<Response>(() => {})
      return Response.json({ id: 'story' })
    })
    const observer = new QueryObserver(client, {
      queryKey: ['story'],
      queryFn: async ({ signal }) => {
        const response = await fetchJson('https://example.test/story', { signal }, 10)
        return response.json()
      },
    })
    const first = observer.refetch()
    assert.equal(transport.mock.callCount(), 1)
    const failure = await first
    assert.equal(failure.isError, true)
    assert.ok(failure.error instanceof ApiError)
    assert.equal(failure.error.status, 408)
    assert.equal(failure.fetchStatus, 'idle')
    assert.equal(transport.mock.callCount(), 1)

    const retry = observer.refetch()
    assert.equal(transport.mock.callCount(), 2)
    const success = await retry
    assert.deepEqual(success.data, { id: 'story' })
    assert.equal(success.isSuccess, true)
    assert.equal(onlineManager.isOnline(), false)
  })

  it('finishes bounded transport retries instead of pausing indefinitely', async () => {
    const queryFn = mock.fn(async (): Promise<{ id: string }> => {
      throw new TypeError('Network request failed')
    })
    const observer = new QueryObserver(client, {
      queryKey: ['story'],
      queryFn,
      retryDelay: 0,
    })
    const request = observer.refetch()
    assert.equal(queryFn.mock.callCount(), 1)
    const failure = await request
    assert.equal(queryFn.mock.callCount(), 4)
    assert.equal(failure.isError, true)
    assert.equal(failure.fetchStatus, 'idle')

    observer.setOptions({ queryKey: ['story'], queryFn: async () => ({ id: 'story' }) })
    assert.deepEqual((await observer.refetch()).data, { id: 'story' })
  })

  it('still refetches stale active data when connectivity returns', async () => {
    const queryFn = mock.fn(async () => ({ id: 'story' }))
    const observer = new QueryObserver(client, { queryKey: ['story'], queryFn })
    const unsubscribe = observer.subscribe(() => {})
    try {
      assert.equal(queryFn.mock.callCount(), 1)
      await observer.refetch()
      onlineManager.setOnline(true)
      await new Promise((resolve) => setTimeout(resolve, 0))
      assert.equal(queryFn.mock.callCount(), 2)
    } finally {
      unsubscribe()
    }
  })
})
