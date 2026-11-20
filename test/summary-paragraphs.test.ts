import { splitCitations, summaryParagraphs } from '@dn/domain'
import { describe, expect, it } from 'vitest'
import { storyHeroFixture } from '../fixtures/story-hero.ts'

describe('summary paragraph reading order', () => {
  it('uses paragraph boundaries in both body and detail without losing citations or anchors', () => {
    const context = [
      {
        id: 'entity',
        anchorText: 'Harrowgate Transit',
        title: 'Transit',
        kind: 'background' as const,
        explanation: 'A rail operator.',
        sources: [],
      },
    ]
    const paragraphs = summaryParagraphs(
      {
        body: 'Harrowgate Transit reported this[1].\n\nA second body paragraph[2].',
        detail: 'Another Harrowgate Transit report[3].\n\n\nFinal paragraph.',
      },
      context,
    )
    expect(paragraphs.map((p) => p.text)).toEqual([
      'Harrowgate Transit reported this[1].',
      'A second body paragraph[2].',
      'Another Harrowgate Transit report[3].',
      'Final paragraph.',
    ])
    expect(paragraphs[0]?.context).toEqual(context)
    expect(paragraphs[2]?.context).toEqual([])
    expect(
      paragraphs.flatMap((p) => splitCitations(p.text)).filter((p) => 'citation' in p),
    ).toEqual([{ citation: 1 }, { citation: 2 }, { citation: 3 }])
  })
  it.each([
    ['long', 4],
    ['extra', 2],
    ['short', 1],
    ['updating', 3],
    ['dark', 2],
    ['dark-long', 3],
    ['none', 2],
  ] as const)('keeps the %s design state in %i structured paragraphs', (state, count) => {
    expect(summaryParagraphs(storyHeroFixture(state).summary)).toHaveLength(count)
  })
  it('does not invent continuation paragraphs for empty or missing detail', () => {
    expect(summaryParagraphs({ body: 'Only paragraph.', detail: ' \n\n ' })).toEqual([
      { text: 'Only paragraph.', context: [] },
    ])
    expect(summaryParagraphs(null)).toEqual([])
  })
})
