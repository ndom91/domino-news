import type { ApiClient } from '@dn/api-client'
import type { StoryDetail } from '@dn/schemas'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { createQueries } from './index.ts'

describe('story enrichment polling', () => {
  it('polls every 15 seconds only while context is pending', () => {
    const options = createQueries({} as ApiClient).story('story')
    const client = new QueryClient()
    const query = client
      .getQueryCache()
      .build<StoryDetail, Error, StoryDetail, readonly ['stories', 'detail', string]>(client, {
        queryKey: ['stories', 'detail', 'story'],
      })
    const interval = options.refetchInterval
    if (typeof interval !== 'function') throw new Error('expected a dynamic polling interval')

    expect(interval(query)).toBe(false)
    query.setData({ enrichment: { context: 'pending' } } as StoryDetail)
    expect(interval(query)).toBe(15_000)
    for (const context of ['ready', 'failed'] as const) {
      query.setData({ enrichment: { context } } as StoryDetail)
      expect(interval(query)).toBe(false)
    }
  })
})

describe('pipeline status polling', () => {
  it('polls every 30 seconds', () => {
    expect(createQueries({} as ApiClient).ops().refetchInterval).toBe(30_000)
  })
})
