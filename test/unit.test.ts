import { normalizeArticleUrl, pickLead, regionForCountry, validateNewEdge } from '@dn/domain'
import { isWireCopy, parseFeed } from '@dn/jobs'
import { layoutNarrative } from '@dn/ui'
import { fixtureNarrative } from '@dn/ui/fixtures'
import { describe, expect, it } from 'vitest'

describe('normalizeArticleUrl', () => {
  it('collapses tracking params, www, fragments and trailing slashes', () => {
    const a = normalizeArticleUrl(
      'http://www.Example.com/news/story/?utm_source=rss&utm_medium=feed#top',
    )
    const b = normalizeArticleUrl('https://example.com/news/story')
    expect(a).toBe(b)
  })
  it('strips publisher tracking params seen in real feeds', () => {
    expect(normalizeArticleUrl('https://www.dw.com/en/a/a-1?maca=en-rss-en-all-1573-rdf')).toBe(
      'https://dw.com/en/a/a-1',
    )
  })
  it('keeps meaningful params, sorted', () => {
    expect(normalizeArticleUrl('https://example.com/a?b=2&a=1&traffic_source=rss')).toBe(
      'https://example.com/a?a=1&b=2',
    )
  })
})

describe('validateNewEdge', () => {
  const t = (iso: string) => new Date(iso)
  const times = { fromFirstObservedAt: t('2026-10-02'), toFirstObservedAt: t('2026-10-01') }
  it('rejects self edges', () => {
    expect(
      validateNewEdge({ fromStoryId: 'a', toStoryId: 'a', relation: 'follows' }, times, []),
    ).toEqual({
      ok: false,
      reason: 'self_edge',
    })
  })
  it('rejects temporal edges pointing forward in time', () => {
    const backwards = { fromFirstObservedAt: t('2026-10-01'), toFirstObservedAt: t('2026-10-02') }
    expect(
      validateNewEdge({ fromStoryId: 'a', toStoryId: 'b', relation: 'follows' }, backwards, []).ok,
    ).toBe(false)
  })
  it('rejects cycles among temporal edges', () => {
    const existing = [{ fromStoryId: 'b', toStoryId: 'a', relation: 'follows' as const }]
    expect(
      validateNewEdge({ fromStoryId: 'a', toStoryId: 'b', relation: 'follows' }, times, existing),
    ).toEqual({
      ok: false,
      reason: 'cycle',
    })
    const chain = [
      { fromStoryId: 'b', toStoryId: 'c', relation: 'follows' as const },
      { fromStoryId: 'c', toStoryId: 'a', relation: 'follows' as const },
    ]
    expect(
      validateNewEdge({ fromStoryId: 'a', toStoryId: 'b', relation: 'follows' }, times, chain),
    ).toEqual({
      ok: false,
      reason: 'cycle',
    })
  })
  it('allows non-temporal links regardless of order', () => {
    const backwards = { fromFirstObservedAt: t('2026-10-01'), toFirstObservedAt: t('2026-10-02') }
    expect(
      validateNewEdge({ fromStoryId: 'a', toStoryId: 'b', relation: 'related_to' }, backwards, [])
        .ok,
    ).toBe(true)
  })
})

describe('parseFeed', () => {
  it('reads RSS items, strips HTML and skips invalid links', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title>One &amp; two</title><link>https://ex.com/a?utm_source=x</link><description>&lt;p&gt;Hi&lt;/p&gt;</description><pubDate>Fri, 09 Oct 2026 10:00:00 +0000</pubDate></item>
      <item><title>BBC</title><link>https://www.bbc.co.uk/news/x?at_medium=RSS&amp;at_campaign=rss</link></item>
      <item><title>Broken</title><link>not a url</link></item>
    </channel></rss>`
    const { items, skipped } = parseFeed(xml)
    expect(skipped).toBe(1)
    expect(items[0]).toMatchObject({
      title: 'One & two',
      description: 'Hi',
      canonicalUrl: 'https://ex.com/a',
      publishedAt: '2026-10-09T10:00:00.000Z',
    })
    expect(items[1]?.canonicalUrl).toBe('https://bbc.co.uk/news/x')
  })
  it('keeps the most complete item when a feed lists one URL twice', () => {
    const xml = `<rss><channel>
      <item><title>🔴 Live: quake</title><link>https://ex.com/q</link></item>
      <item><title>Quake</title><link>https://ex.com/q</link><description>Details\u200b here</description></item>
    </channel></rss>`
    const { items } = parseFeed(xml)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ title: 'Quake', description: 'Details here' })
  })
})

describe('layoutNarrative', () => {
  it('continues lanes for follow-ups and opens new lanes for branches', () => {
    const layout = layoutNarrative(fixtureNarrative.stories, fixtureNarrative.edges)
    const lane = (id: string) => layout.rows.find((r) => r.node.id === id)?.lane
    expect(layout.rows.map((r) => r.node.id)).toEqual([
      'sty_icc',
      'sty_pillay',
      'sty_trump',
      'sty_reax',
    ])
    expect(lane('sty_trump')).toBe(lane('sty_pillay'))
    expect(lane('sty_reax')).not.toBe(lane('sty_pillay'))
  })
})

describe('PriorityLimiter', () => {
  it('serves waiting work interactive → fresh → backfill and never exceeds the cap', async () => {
    const { PriorityLimiter } = await import('@dn/jobs')
    const limiter = new PriorityLimiter(1)
    const order: string[] = []
    let active = 0
    let maxActive = 0
    let releaseFirst: () => void = () => {}
    const task = (name: string, hold?: Promise<void>) => async () => {
      active++
      maxActive = Math.max(maxActive, active)
      order.push(name)
      await hold
      active--
    }
    const first = limiter.run('backfill', task('running', new Promise((r) => (releaseFirst = r))))
    // Queue while the only slot is busy, in deliberately "wrong" order.
    const waiting = [
      limiter.run('backfill', task('backfill')),
      limiter.run('fresh', task('fresh')),
      limiter.run('interactive', task('interactive')),
    ]
    releaseFirst()
    await Promise.all([first, ...waiting])
    expect(order).toEqual(['running', 'interactive', 'fresh', 'backfill'])
    expect(maxActive).toBe(1)
  })
})

describe('parseFeed reported update times', () => {
  it('captures Atom <updated> separately from the publish date', () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
      <title>Atom item</title><link href="https://ex.com/atom"/><id>urn:1</id>
      <published>2026-10-09T08:00:00Z</published><updated>2026-10-09T11:30:00Z</updated>
      <summary>Short</summary></entry></feed>`
    const { items } = parseFeed(xml)
    expect(items[0]).toMatchObject({
      publishedAt: '2026-10-09T08:00:00.000Z',
      updatedAt: '2026-10-09T11:30:00.000Z',
    })
  })
})

describe('annotateText', () => {
  it('marks the first occurrence of each anchor and skips overlaps', async () => {
    const { annotateText } = await import('@dn/ui')
    const item = (id: string, anchorText: string) => ({
      id,
      anchorText,
      title: anchorText,
      kind: 'background' as const,
      explanation: '',
      sources: [],
    })
    const parts = annotateText('The ICC said the ICC Prosecutor would appeal.', [
      item('a', 'ICC'),
      item('b', 'ICC Prosecutor'),
      item('c', 'missing'),
    ])
    expect(parts.map((p) => ('item' in p ? `[${p.text}]` : p.text)).join('')).toBe(
      'The [ICC] said the [ICC Prosecutor] would appeal.',
    )
  })
})

describe('regions', () => {
  it('maps publisher countries to macro-regions', () => {
    expect(regionForCountry('GB')).toBe('europe')
    expect(regionForCountry('qa')).toBe('middle-east')
    expect(regionForCountry('ZZ')).toBeNull()
    expect(regionForCountry(null)).toBeNull()
  })

  it('prefers recent edition stories for the lead, else the most-sourced recent story', () => {
    const now = Date.parse('2026-10-10T12:00:00Z')
    const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString()
    const stories = [
      { id: 'big', lastUpdatedAt: at(1), sourceCount: 9, regions: ['north-america'] },
      { id: 'eu', lastUpdatedAt: at(2), sourceCount: 3, regions: ['europe'] },
      { id: 'old-eu', lastUpdatedAt: at(72), sourceCount: 12, regions: ['europe'] },
    ]
    expect(pickLead(stories, null, now)?.id).toBe('big')
    expect(pickLead(stories, 'europe', now)?.id).toBe('eu')
    expect(pickLead(stories, 'africa', now)?.id).toBe('big')
  })
})

describe('isWireCopy', () => {
  it('flags agency bylines in author metadata only', () => {
    expect(isWireCopy('<meta name="author" content="The Associated Press">')).toBe(true)
    expect(isWireCopy('<meta content="Reuters" property="article:author">')).toBe(true)
    expect(isWireCopy('{"author":[{"@type":"Organization","name":"AFP"}]}')).toBe(true)
    expect(isWireCopy('<meta name="author" content="Jane Doe">')).toBe(false)
    expect(isWireCopy('<p>Reuters reported that the AP and AFP agreed.</p>')).toBe(false)
  })
})

describe('citation markers', () => {
  it('renumbers model markers to cited-source order and drops unknown ones', async () => {
    const { renumberCitations, splitCitations } = await import('@dn/domain')
    // Shown in publishing order: a (1), b (2), c (3), d (4). The model cites b and d, plus lists c.
    const { body, citation } = renumberCitations(
      'X happened, according to B[2] and D[4, 9]. C reports more [7].',
      ['a', 'b', 'c', 'd'],
      ['c'],
    )
    expect([...citation.entries()]).toEqual([
      ['b', 1],
      ['c', 2],
      ['d', 3],
    ])
    expect(body).toBe('X happened, according to B[1] and D[3]. C reports more.')
    expect(splitCitations('A[1] and B[3].')).toEqual([
      { text: 'A' },
      { citation: 1 },
      { text: ' and B' },
      { citation: 3 },
      { text: '.' },
    ])
  })
})
