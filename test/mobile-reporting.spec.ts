import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { StoryLean, StorySource } from '@dn/schemas'
import { groupReporting } from '../apps/mobile/lib/reporting-groups'

describe('mobile reporting groups', () => {
  it('sorts reports by published or observed time and puts official and unrated reports together', () => {
    const source = (id: string, at: string, official = false) =>
      ({
        articleId: id,
        publisher: { id },
        publishedAt: null,
        observedAt: at,
        official,
      }) as StorySource
    const sources = [
      source('official', '2026-01-03', true),
      source('left', '2026-01-02'),
      source('unknown', '2026-01-01'),
    ]
    const lean = [
      {
        country: 'US',
        publishers: [
          { publisher: { id: 'official' }, lean: 'right', estimated: false },
          { publisher: { id: 'left' }, lean: 'left', estimated: true },
        ],
        oneSided: null,
      },
    ] as StoryLean[]
    const result = groupReporting(sources, lean)
    assert.deepEqual(
      result.ordered.map((item) => item.articleId),
      ['unknown', 'left', 'official'],
    )
    assert.deepEqual(
      result.groups.find((group) => group.group === 'left')?.items.map((item) => item.articleId),
      ['left'],
    )
    assert.deepEqual(
      result.groups.find((group) => group.group === 'unrated')?.items.map((item) => item.articleId),
      ['unknown', 'official'],
    )
    assert.equal(result.ratings.get('left')?.estimated, true)
  })
})
