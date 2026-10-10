import { createTypesense } from '@dn/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('typesense client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('throws when an individual multi_search request fails inside a 200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ results: [{ code: 400, error: 'bad query_by' }] })),
    )
    const ts = createTypesense('http://ts.test', 'key')
    await expect(ts.multiSearch([{ collection: 'stories', q: 'x' }])).rejects.toThrow(
      /bad query_by/,
    )
  })
})
