import { readFileSync } from 'node:fs'
import {
  clockTime,
  countryFromHeader,
  dayLabel,
  formatDate,
  formatDateTime,
  hostnameOf,
  leanBand,
  leanSide,
  normalizeArticleUrl,
  oneSidedCoverage,
  pickLead,
  plural,
  recencyPeriod,
  regionForCountry,
  storiesPerDay,
  validateNewEdge,
  zoneName,
} from '@dn/domain'
import {
  embeddingDocument,
  findRspEntry,
  forYouExpoMessage,
  isStaleItem,
  isWireCopy,
  leanEvidenceFileSchema,
  leanEvidenceRow,
  parseFeed,
  parseRspWikitext,
  sendExpoPush,
  wikidataEvidence,
} from '@dn/jobs'
import { clampWeight, decayed, scoreStory } from '@dn/server'
import { cx, layoutNarrative, THEME_TOKENS } from '@dn/ui'
import { fixtureNarrative } from '@dn/ui/fixtures'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
  it('drops stylesheet content from descriptions', () => {
    const xml = `<rss><channel><item>
      <title>One</title><link>https://ex.com/a</link>
      <description><![CDATA[<style>.hero { background: red; }</style><p>Readable reporting.</p>]]></description>
    </item></channel></rss>`
    const { items } = parseFeed(xml)
    expect(items[0]?.description).toBe('Readable reporting.')
  })
})

describe('embeddingDocument', () => {
  it('keeps embedding input within the document limit', () => {
    const document = embeddingDocument('Headline', 'a'.repeat(7000))
    expect(document.title).toBe('Headline')
    expect(document.title.length + document.text.length).toBe(6000)
  })
})

describe('layoutNarrative', () => {
  it('orders Stories in time and writes their links as primary and secondary relations', () => {
    const edges = [
      ...fixtureNarrative.edges,
      // A weaker extra link from sty_trump to sty_icc must not replace its primary.
      { id: 'e4', fromStoryId: 'sty_trump', toStoryId: 'sty_icc', relation: 'follows' as const },
    ]
    const { rows } = layoutNarrative(fixtureNarrative.stories, edges)
    const row = (id: string) => rows.find((r) => r.node.id === id)
    expect(rows.map((r) => r.node.id)).toEqual(['sty_icc', 'sty_pillay', 'sty_trump', 'sty_reax'])
    expect(row('sty_icc')?.primary).toBeNull()
    // follows is preferred over related_to as the line shown above the headline.
    expect(row('sty_trump')?.primary).toEqual({ parentId: 'sty_icc', relation: 'follows' })
    expect(row('sty_trump')?.secondary).toEqual([
      { otherId: 'sty_pillay', relation: 'related_to', direction: 'outgoing' },
    ])
    // sty_reax's branch is its own primary, so sty_pillay does not list it again.
    expect(row('sty_pillay')?.secondary.map((s) => s.otherId)).not.toContain('sty_reax')
  })
})

describe('storiesPerDay', () => {
  it('counts per UTC day with empty lead-in days and gaps', () => {
    const days = storiesPerDay(
      ['2026-10-08T23:59:00Z', '2026-10-08T01:00:00Z', '2026-10-10T00:00:00Z'],
      2,
    )
    expect(days.map((d) => [d.day.slice(0, 10), d.count])).toEqual([
      ['2026-10-06', 0],
      ['2026-10-07', 0],
      ['2026-10-08', 2],
      ['2026-10-09', 0],
      ['2026-10-10', 1],
    ])
  })

  it('is empty without stories', () => {
    expect(storiesPerDay([])).toEqual([])
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

  it("prefers recent stories in the reader's regions for the lead, else the most-sourced", () => {
    const now = Date.parse('2026-10-10T12:00:00Z')
    const at = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString()
    const stories = [
      { id: 'big', lastUpdatedAt: at(1), sourceCount: 9, regions: ['north-america'] },
      { id: 'eu', lastUpdatedAt: at(2), sourceCount: 3, regions: ['europe'] },
      { id: 'old-eu', lastUpdatedAt: at(72), sourceCount: 12, regions: ['europe'] },
    ]
    expect(pickLead(stories, [], now)?.id).toBe('big')
    expect(pickLead(stories, ['europe'], now)?.id).toBe('eu')
    expect(pickLead(stories, ['africa', 'europe'], now)?.id).toBe('eu')
    expect(pickLead(stories, ['africa'], now)?.id).toBe('big')
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

describe('display helpers', () => {
  it('pluralises counts', () => {
    expect(plural(1, 'story', 'stories')).toBe('1 story')
    expect(plural(0, 'story', 'stories')).toBe('0 stories')
    expect(plural(3, 'outlet')).toBe('3 outlets')
  })

  it('returns null for a malformed URL instead of throwing', () => {
    expect(hostnameOf('https://www.example.com/a?b=1')).toBe('example.com')
    expect(hostnameOf('not a url')).toBeNull()
  })

  it('formats times in UTC by default and in a given zone', () => {
    const at = '2026-10-10T22:30:00Z'
    expect(clockTime(at)).toBe('22:30')
    expect(formatDate(at)).toBe('10 Oct')
    expect(formatDateTime(at)).toBe('10 Oct 2026, 22:30 UTC')
    expect(zoneName(at)).toBe('UTC')
    // Berlin is UTC+2 in October, which also moves the date.
    expect(clockTime(at, 'Europe/Berlin')).toBe('00:30')
    expect(formatDate(at, 'Europe/Berlin')).toBe('11 Oct')
    expect(formatDateTime(at, 'Europe/Berlin')).toBe('11 Oct 2026, 00:30 CEST')
    expect(zoneName(at, 'Europe/Berlin')).toBe('CEST')
    expect(zoneName(at, 'America/Bogota')).toBe('GMT-5')
  })
})

describe('fixtureTopics', () => {
  it('tags up to three topics from the headline', async () => {
    const { fixtureTopics } = await import('@dn/inference')
    expect(fixtureTopics('Missile strike hits Kyiv power station')).toEqual([
      'energy',
      'ukraine-war',
    ])
    expect(fixtureTopics('Quiet day')).toEqual([])
    expect(
      fixtureTopics('Court rules on election ballot and border asylum and tariffs').length,
    ).toBe(3)
  })
})

describe('fixtureDesk', () => {
  it('tags the first matching desk and falls back to politics', async () => {
    const { fixtureDesk } = await import('@dn/inference')
    expect(fixtureDesk('Missile strike hits Kyiv power station')).toBe('conflict')
    expect(fixtureDesk('Court halts rail strike')).toBe('justice')
    expect(fixtureDesk('Central bank holds rates')).toBe('economy')
    expect(fixtureDesk('Wildfire smoke triggers alerts')).toBe('science')
    expect(fixtureDesk('Parliament committee advances bill')).toBe('politics')
  })
})

describe('isStaleItem', () => {
  it('drops items older than the max age and keeps undated ones', () => {
    const now = new Date('2026-10-10T12:00:00Z')
    expect(isStaleItem('2016-03-04T10:15:00Z', now, 3)).toBe(true)
    expect(isStaleItem('2026-10-06T12:00:00Z', now, 3)).toBe(true)
    expect(isStaleItem('2026-10-08T12:00:00Z', now, 3)).toBe(false)
    expect(isStaleItem(null, now, 3)).toBe(false)
  })
})

describe('date grouping', () => {
  const now = '2026-10-10T08:00:00Z'
  it('labels feed days in UTC', () => {
    expect(dayLabel('2026-10-10T00:30:00Z', now)).toBe('Today')
    expect(dayLabel('2026-10-09T23:59:00Z', now)).toBe('Yesterday')
    expect(dayLabel('2026-10-08T12:00:00Z', now)).toBe('Thursday 8 Oct')
  })
  it('buckets by recency', () => {
    expect(recencyPeriod('2026-10-10T01:00:00Z', now)).toBe('today')
    expect(recencyPeriod('2026-10-04T12:00:00Z', now)).toBe('week')
    expect(recencyPeriod('2026-09-20T12:00:00Z', now)).toBe('month')
    expect(recencyPeriod('2026-08-01T12:00:00Z', now)).toBe('older')
  })
})

describe('prompt inputs', () => {
  it('tell the model which sources are official', async () => {
    const { summarizeStoryPrompt } = await import('@dn/inference')
    const article = (id: string, publisherKind?: 'newsroom' | 'official') => ({
      articleId: id,
      observationId: `obs_${id}`,
      publisher: id,
      publisherKind,
      title: 't',
      description: null,
      publishedAt: null,
    })
    const prompt = summarizeStoryPrompt({
      story: {
        storyId: 's',
        title: 't',
        summary: null,
        firstObservedAt: '2026-10-10T00:00:00Z',
        articles: [article('cdc', 'official'), article('bbc')],
      },
    })
    expect(prompt).toContain('"sourceType": "official"')
    expect(prompt).toContain('"sourceType": "newsroom"')
  })

  it('ask for a summary plus 2-3 paragraphs of detail in the same call', async () => {
    const { summarizeStoryPrompt } = await import('@dn/inference')
    const prompt = summarizeStoryPrompt({
      story: {
        storyId: 's',
        title: 't',
        summary: null,
        firstObservedAt: '2026-10-10T00:00:00Z',
        articles: [],
      },
    })
    expect(prompt).toContain('- summary: 2-4 short sentences')
    expect(prompt).toContain('- detail: 2-3 short paragraphs separated by a blank line')
    expect(prompt).toContain("Do not repeat the summary's")
  })

  it('only allow related_to for one nameable event, not a shared theme', async () => {
    const { classifyRelationshipPrompt } = await import('@dn/inference')
    const story = (storyId: string) => ({
      storyId,
      title: 't',
      summary: null,
      firstObservedAt: '2026-10-10T00:00:00Z',
      articles: [],
    })
    const prompt = classifyRelationshipPrompt({ newer: story('n'), older: story('o') })
    expect(prompt).toContain('You must be able to name that one event')
    expect(prompt).toContain('When the only link is a theme, answer "unrelated"')
  })

  it('ask for up to 6 context terms and lean towards including them', async () => {
    const { explainContextPrompt } = await import('@dn/inference')
    const prompt = explainContextPrompt({
      story: {
        storyId: 's',
        title: 't',
        summary: null,
        firstObservedAt: '2026-10-10T00:00:00Z',
        articles: [],
      },
      summary: 's',
    })
    expect(prompt).toContain('Pick up to 6')
    expect(prompt).toContain('If unsure whether a general reader knows it, include it')
  })
})

describe('assessment evidence parsing', () => {
  it('reads status and domains from perennial sources rows', () => {
    const wikitext = `{| class="wikitable"
|- class="s-gr" id="The New York Times"
| data-sort-value="New York Times" | ''[[The New York Times]]''
| {{WP:RSPSTATUS|gr}}
| {{WP:RSPUSES|nytimes.com}}
|- class="s-d"
| ''[[Daily Mail]]''
| {{WP:RSPSTATUS|d}}
| {{WP:RSPUSES|dailymail.co.uk|mailonsunday.co.uk}}
|- id="CBS News" class="s-gr"
| ''[[CBS News]]''
| {{WP:RSPSTATUS|gr}}
| {{WP:RSPUSES|cbsnews.com}}
|- class="s-gr" id="BBC"
| [[BBC]]
| {{WP:RSPSTATUS|gr}}
| It excludes publications such as ''[[Collective (BBC)|Collective]]''.
| {{WP:RSPUSES|bbc.co.uk|bbc.com}}
|}`
    const entries = parseRspWikitext(wikitext)
    expect(entries).toEqual([
      { name: 'The New York Times', status: 'Generally reliable', domains: ['nytimes.com'] },
      {
        name: 'Daily Mail',
        status: 'Deprecated',
        domains: ['dailymail.co.uk', 'mailonsunday.co.uk'],
      },
      // Attributes in the other order, and a description that links another work.
      { name: 'CBS News', status: 'Generally reliable', domains: ['cbsnews.com'] },
      { name: 'BBC', status: 'Generally reliable', domains: ['bbc.co.uk', 'bbc.com'] },
    ])
    expect(findRspEntry(entries, 'www.nytimes.com')?.name).toBe('The New York Times')
    expect(findRspEntry(entries, 'mailonsunday.co.uk')?.status).toBe('Deprecated')
    expect(findRspEntry(entries, 'example.com')).toBeUndefined()
  })

  it('describes owners, their kind and their own owner from Wikidata', () => {
    const ref = (id: string) => ({ mainsnak: { datavalue: { value: { id } } } })
    const item = { id: 'Q1', claims: { P127: [ref('Q2')], P1387: [ref('Q9')] } }
    const related = {
      Q2: {
        id: 'Q2',
        labels: { de: { value: 'Netz GmbH' } },
        claims: { P31: [ref('Q3')], P127: [ref('Q4')] },
      },
      Q3: { id: 'Q3', labels: { en: { value: 'business' } } },
      Q4: { id: 'Q4', labels: { en: { value: 'Government of Exampleland' } } },
      Q9: { id: 'Q9', labels: { en: { value: 'centrism' } } },
    }
    expect(wikidataEvidence(item, related).map((e) => `${e.dimension}: ${e.value}`)).toEqual([
      'ownership: Owned by Netz GmbH (business), itself owned by Government of Exampleland',
      'lean: Political alignment (community-edited, unsourced): centrism',
    ])
  })
})

describe('For You scoring', () => {
  const picks = {
    regions: ['europe'] as const,
    desks: ['science'] as const,
    topics: ['climate'] as const,
    narratives: new Map([['nar_sudan', "Sudan's civil war"]]),
    publishers: new Map([['pub_bbc', 'BBC News']]),
  }
  const story = (over: Partial<Parameters<typeof scoreStory>[0]> = {}) => ({
    desk: null,
    regions: [],
    topics: [],
    ageHours: 2,
    outlets: 2,
    narrativeIds: [],
    publisherIds: [],
    ...over,
  })

  it('ranks follows above picks above everything else, and explains why', () => {
    const followed = scoreStory(story({ narrativeIds: ['nar_sudan'] }), picks)
    const picked = scoreStory(story({ regions: ['europe'], desk: 'science' }), picks)
    const other = scoreStory(story(), picks)
    expect(followed.score).toBeGreaterThan(picked.score)
    expect(picked.score).toBeGreaterThan(other.score)
    expect(followed.reasons).toEqual([{ kind: 'narrative', label: "Sudan's civil war" }])
    expect(picked.reasons.map((r) => r.label)).toEqual(['Europe', 'Science'])
    expect(other.reasons).toEqual([])
  })

  it('ranks a picked topic above a picked region or desk', () => {
    const topic = scoreStory(story({ topics: ['climate'] }), picks)
    const region = scoreStory(story({ regions: ['europe'] }), picks)
    expect(topic.score).toBeGreaterThan(region.score)
    expect(topic.reasons).toEqual([{ kind: 'topic', label: 'Climate' }])
  })

  it('keeps big stories outside your picks, but newer and wider coverage wins', () => {
    const big = scoreStory(story({ outlets: 15 }), picks)
    const small = scoreStory(story({ outlets: 2 }), picks)
    const stale = scoreStory(story({ outlets: 2, ageHours: 60 }), picks)
    expect(big.score).toBeGreaterThan(small.score)
    expect(small.score).toBeGreaterThan(stale.score)
  })
})

describe('learned feedback weights', () => {
  it('halve every 30 days and stay within ±3', () => {
    const now = new Date('2026-10-11T00:00:00Z')
    expect(decayed(2, now, now)).toBe(2)
    expect(decayed(2, new Date('2026-09-11T00:00:00Z'), now)).toBeCloseTo(1)
    expect(clampWeight(7)).toBe(3)
    expect(clampWeight(-7)).toBe(-3)
  })

  it('move stories up or down and explain positive ones', () => {
    const base = {
      desk: 'science' as const,
      regions: [],
      topics: ['climate' as const],
      ageHours: 2,
      outlets: 2,
      narrativeIds: [],
      publisherIds: [],
    }
    const picks = {
      regions: [],
      desks: [],
      topics: [],
      narratives: new Map(),
      publishers: new Map(),
      learnedLabel: () => 'Climate',
    }
    const neutral = scoreStory(base, picks)
    const liked = scoreStory(base, { ...picks, learned: new Map([['topic:climate', 2]]) })
    const disliked = scoreStory(base, { ...picks, learned: new Map([['topic:climate', -2]]) })
    expect(liked.score).toBeGreaterThan(neutral.score)
    expect(disliked.score).toBeLessThan(neutral.score)
    expect(liked.reasons).toEqual([{ kind: 'learned', label: 'Climate' }])
    expect(disliked.reasons).toEqual([])
  })
})

describe('cx (tailwind-merge with our tokens)', () => {
  it('knows every theme token, so it never misreads one', () => {
    const css = readFileSync(
      new URL('../packages/design-tokens/theme.css', import.meta.url),
      'utf8',
    )
    const prefixes = {
      text: '--text-',
      leading: '--leading-',
      'font-weight': '--font-weight-',
      tracking: '--tracking-',
      spacing: '--spacing-',
      container: '--container-',
      radius: '--radius-',
      shadow: '--shadow-',
      breakpoint: '--breakpoint-',
    } as const
    for (const [group, prefix] of Object.entries(prefixes)) {
      const names = [...css.matchAll(new RegExp(`^\\s*${prefix}([a-z0-9-]+):`, 'gm'))]
        .map((m) => m[1])
        .filter((n) => n !== undefined)
      expect([...THEME_TOKENS[group as keyof typeof THEME_TOKENS]].sort(), group).toEqual(
        [...new Set(names)].sort(),
      )
    }
  })

  it('lets the later class win, without dropping unrelated ones', () => {
    expect(cx('size-tap px-4', 'px-0')).toBe('size-tap px-0')
    expect(cx('text-label text-text-muted')).toBe('text-label text-text-muted')
    expect(cx('text-sm', 'text-label')).toBe('text-label')
    expect(cx('h-bar', false, 'h-3')).toBe('h-3')
    expect(cx('type-meta key-fill')).toBe('type-meta key-fill')
  })
})

describe('lean', () => {
  it('puts centre on neither side', () => {
    expect(leanSide('centre_left')).toBe('left')
    expect(leanSide('right')).toBe('right')
    expect(leanSide('centre')).toBeNull()
    expect(leanSide(null)).toBeNull()
  })

  it('collapses the publisher scale into coverage bands', () => {
    expect(leanBand('left')).toBe('left')
    expect(leanBand('centre_left')).toBe('left')
    expect(leanBand('centre')).toBe('center')
    expect(leanBand('centre_right')).toBe('right')
    expect(leanBand('right')).toBe('right')
    expect(leanBand(null)).toBeNull()
  })

  it('needs 3 rated publishers and a 75% share for one-sided coverage', () => {
    // Unrated publishers don't count toward either threshold.
    expect(oneSidedCoverage(['left', 'centre_left', null, null])).toBeNull()
    expect(oneSidedCoverage(['left', 'centre_left', 'left'])).toBe('left')
    // 3 of 4 is exactly 75%; centre still counts as rated.
    expect(oneSidedCoverage(['right', 'centre_right', 'right', 'centre'])).toBe('right')
    expect(oneSidedCoverage(['right', 'centre_right', 'centre', 'centre'])).toBeNull()
    expect(oneSidedCoverage(['left', 'left', 'right', 'right'])).toBeNull()
  })

  it('reads a country from the Cloudflare header', () => {
    expect(countryFromHeader('gb')).toBe('GB')
    expect(countryFromHeader('XX')).toBeNull()
    expect(countryFromHeader('T1')).toBeNull()
    expect(countryFromHeader('USA')).toBeNull()
    expect(countryFromHeader(null)).toBeNull()
  })
})

describe('hand-checked lean evidence', () => {
  const allsides = {
    publisher: 'nytimes',
    source: 'allsides',
    rating: 'Lean Left',
    countryContext: 'US',
    url: 'https://www.allsides.com/news-source/new-york-times',
    checkedAt: '2026-10-11',
  }

  it('maps AllSides ratings to our steps and names the scale', () => {
    const [entry] = leanEvidenceFileSchema.parse({ entries: [allsides] }).entries
    if (!entry) throw new Error('no entry')
    expect(leanEvidenceRow(entry)).toMatchObject({
      source: 'allsides',
      dimension: 'lean',
      lean: 'centre_left',
      countryContext: 'US',
      value: expect.stringContaining('US political scale'),
    })
  })

  it('accepts published estimates, inconclusive research, and inapplicable axes', () => {
    const estimate = {
      publisher: 'groundup',
      source: 'domino_estimate',
      applicable: true,
      lean: 'centre_left',
      countryContext: 'ZA',
      confidence: 'medium',
      rubric: 'lean-estimate@1',
      rationale: 'Two indicators …',
      sources: ['https://example.org/a'],
      estimatedAt: '2026-10-12',
    }
    const ok = (entry: unknown) => leanEvidenceFileSchema.safeParse({ entries: [entry] }).success
    expect(ok(estimate)).toBe(true)
    expect(ok({ ...estimate, confidence: 'low' })).toBe(false)
    const inconclusive = { ...estimate, lean: null, confidence: null }
    expect(ok(inconclusive)).toBe(true)
    expect(ok({ ...estimate, applicable: false, lean: null, confidence: null })).toBe(false)
    expect(ok({ ...estimate, applicable: false, axisNote: 'Pro-government vs independent.' })).toBe(
      false,
    )
    expect(ok({ ...estimate, confidence: null })).toBe(false)
    const notApplicable = {
      ...estimate,
      applicable: false,
      lean: null,
      confidence: null,
      axisNote: 'Pro-government vs independent.',
    }
    expect(ok(notApplicable)).toBe(true)
    const [entry] = leanEvidenceFileSchema.parse({ entries: [notApplicable] }).entries
    if (!entry) throw new Error('no entry')
    expect(leanEvidenceRow(entry)).toMatchObject({ source: 'domino_estimate', lean: null })
    const [inconclusiveEntry] = leanEvidenceFileSchema.parse({ entries: [inconclusive] }).entries
    if (!inconclusiveEntry) throw new Error('no entry')
    expect(leanEvidenceRow(inconclusiveEntry).value).toContain('insufficient evidence')
  })

  it('rejects AllSides outside the US scale, unknown ratings and out-of-range scores', () => {
    const bad = (entry: unknown) => leanEvidenceFileSchema.safeParse({ entries: [entry] }).success
    expect(bad({ ...allsides, countryContext: 'GB' })).toBe(false)
    expect(bad({ ...allsides, rating: 'Mixed' })).toBe(false)
    const dnr = {
      publisher: 'guardian',
      source: 'reuters_dnr',
      score: -0.21,
      lean: 'centre_left',
      countryContext: 'GB',
      edition: 2025,
      url: 'https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2025',
      checkedAt: '2026-10-11',
    }
    expect(bad(dnr)).toBe(true)
    expect(bad({ ...dnr, score: 0.8 })).toBe(false)
  })
})

describe('local generation adapter', () => {
  const article = (id: string) => ({
    articleId: `art_${id}`,
    observationId: `obs_${id}`,
    publisher: id,
    title: 't',
    description: null,
    publishedAt: null,
  })
  const story = {
    storyId: 'sty_1',
    title: 't',
    summary: null,
    firstObservedAt: '2026-10-10T00:00:00Z',
    articles: [article('a'), article('b')],
  }
  // One chat completion with the given JSON content and finish reason.
  const reply = (content: unknown, finish_reason = 'stop') =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          choices: [{ message: { content: JSON.stringify(content) }, finish_reason }],
        }),
      ),
    )
  const generation = async () => {
    const { createLocalGeneration } = await import('@dn/inference')
    return createLocalGeneration({
      baseUrl: 'http://inference.test',
      embeddingModel: 'e',
      generationModel: 'g',
    })
  }
  const decision = async () => {
    const { createLocalStoryChoiceDecision } = await import('@dn/inference')
    return createLocalStoryChoiceDecision({
      baseUrl: 'http://inference.test',
      embeddingModel: 'e',
      generationModel: 'g',
      decisionModel: 'kev',
    })
  }
  afterEach(() => vi.unstubAllGlobals())

  it('sends numbered sources, never IDs', async () => {
    const { summarizeStoryPrompt } = await import('@dn/inference')
    const prompt = summarizeStoryPrompt({ story })
    expect(prompt).toContain('"n": 2')
    expect(prompt).not.toContain('art_a')
    expect(prompt).not.toContain('obs_a')
  })

  it('maps the numbers the model cites back to article and observation IDs', async () => {
    reply({
      headline: 'h',
      summary: 's[2]',
      detail: 'd[1]',
      sources: [2],
      regions: ['europe'],
      desk: 'politics',
      topics: [],
    })
    const { output } = await (await generation()).summarizeStory({ story })
    expect(output.sourceArticleIds).toEqual(['art_b'])
    expect(output.observationIds).toEqual(['obs_b'])
  })

  it('maps a System One Story choice and keeps article bodies out of its compact input', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ answers: { story: { choice: 'story_2', confidence: 0.91 } } }),
    )
    vi.stubGlobal('fetch', fetch)
    const { output } = await (await decision()).chooseStory({
      article: { ...article('new'), body: 'Transient article body.' },
      stories: [story, { ...story, storyId: 'sty_2', title: 'Second story' }],
    })
    expect(output).toEqual({ storyId: 'sty_2', rationale: '', confidence: 0.91 })
    const [, options] = fetch.mock.calls[0] ?? []
    expect(String(options?.body)).not.toContain('Transient article body.')
  })

  it('drops material-only fields from a non-material assessment', async () => {
    reply({
      changeKind: 'new_fact',
      outcome: 'corroboration_only',
      note: 'Added a fact.',
      sources: [1],
    })
    const { output } = await (await generation()).assessSummaryUpdate({
      update: { storyId: 'sty_1', previousSummary: 'Existing summary.', articles: [article('a')] },
    })
    expect(output).toEqual({
      changeKind: null,
      outcome: 'corroboration_only',
      note: '',
      sourceArticleIds: [],
      observationIds: [],
    })
  })

  it('rejects a number outside the list', async () => {
    reply({
      claims: [
        { proposition: 'A thing happened.', mentions: [{ n: 3, stance: 'asserts' }], evidence: [] },
      ],
    })
    await expect((await generation()).extractClaims({ story, primarySources: [] })).rejects.toThrow(
      /cites source 3, but there are 2/,
    )
  })

  it('reports a truncated response as truncated, with its start', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          choices: [{ message: { content: '{"claims": [{"propos' }, finish_reason: 'length' }],
        }),
      ),
    )
    await expect((await generation()).extractClaims({ story, primarySources: [] })).rejects.toThrow(
      /truncated at 2400 tokens\. Starts: \{"claims"/,
    )
  })
})

describe('Story decision acceptance', () => {
  it('accepts only a confident positive match', async () => {
    const { acceptsStoryDecision } = await import('@dn/jobs')
    expect(acceptsStoryDecision({ storyId: 'sty_1', confidence: 0.8 }, 0.8)).toBe(true)
    expect(acceptsStoryDecision({ storyId: 'sty_1', confidence: 0.79 }, 0.8)).toBe(false)
    expect(acceptsStoryDecision({ storyId: null, confidence: 1 }, 0.8)).toBe(false)
  })
})

describe('match admission', () => {
  it('elects the oldest concurrent unmatched article and ignores stale or matched neighbours', async () => {
    const { electMatchLeader } = await import('@dn/jobs')
    const now = new Date('2026-10-25T12:00:00Z')
    const candidate = (
      id: string,
      publishedMinutes: number,
      firstSeenMinutes: number,
      storyId: string | null = null,
    ) => ({
      id,
      at: new Date(now.getTime() + publishedMinutes * 60_000),
      firstSeenAt: new Date(now.getTime() + firstSeenMinutes * 60_000),
      storyId,
    })
    expect(
      electMatchLeader('current', [
        candidate('current', 2, 2),
        candidate('leader', 0, 1),
        candidate('stale', -60, -60),
        candidate('matched', -1, 1, 'sty_1'),
      ])?.id,
    ).toBe('leader')
  })
})

describe('optional enrichment admission', () => {
  it('keeps low-visibility Stories lazy', async () => {
    const { optionalEnrichmentQueues, QUEUES } = await import('@dn/server')
    expect(optionalEnrichmentQueues(2, 3)).toEqual([])
    expect(optionalEnrichmentQueues(3, 3)).toEqual([QUEUES.generateContext, QUEUES.extractClaims])
  })
})

describe('Expo push delivery', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the story slug in an Expo payload', async () => {
    const fetch = vi.fn(async () => Response.json({ data: [{ status: 'ok', id: 'ticket_1' }] }))
    vi.stubGlobal('fetch', fetch)

    await expect(
      sendExpoPush([
        {
          to: 'ExponentPushToken[token]',
          title: 'For You',
          body: 'A story happened.',
          sound: 'default',
          channelId: 'for-you',
          data: { storySlug: 'a-story' },
        },
      ]),
    ).resolves.toEqual([{ status: 'ok', id: 'ticket_1' }])

    expect(fetch).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({
        body: expect.stringContaining('"storySlug":"a-story"'),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    )
  })

  it('removes source citations from the notification body', () => {
    expect(
      forYouExpoMessage('ExponentPushToken[token]', {
        slug: 'a-story',
        summary: 'A story happened[1, 2].',
        title: 'A story happened',
      }),
    ).toMatchObject({ body: 'A story happened.', data: { storySlug: 'a-story' } })
  })

  it('rejects malformed Expo ticket responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ data: [] })),
    )
    await expect(
      sendExpoPush([
        {
          to: 'ExponentPushToken[token]',
          title: 'For You',
          body: 'A story happened.',
          sound: 'default',
          channelId: 'for-you',
          data: { storySlug: 'a-story' },
        },
      ]),
    ).rejects.toThrow('invalid ticket response')
  })
})

describe('API client on native', () => {
  it('sends the session cookie from an async header hook, with credentials omitted', async () => {
    const { createApiClient } = await import('@dn/api-client')
    const calls: {
      url: string
      init: { headers?: Record<string, string>; credentials?: string }
    }[] = []
    const api = createApiClient({
      baseUrl: 'https://news.example.com',
      fetch: async (url, init) => {
        calls.push({ url, init: init as (typeof calls)[number]['init'] })
        return Response.json({ items: [], pageInfo: { nextCursor: null } })
      },
      headers: async () => ({ cookie: 'better-auth.session_token=abc' }),
      credentials: 'omit',
    })
    await api.listNarratives()
    expect(calls[0]?.url).toBe('https://news.example.com/api/v1/narratives')
    expect(calls[0]?.init.headers?.cookie).toBe('better-auth.session_token=abc')
    expect(calls[0]?.init.credentials).toBe('omit')
  })
})

describe('match label review page', () => {
  it('embeds hostile headlines as inert data', async () => {
    const { reviewHtml } = await import('@dn/jobs')
    const title = '</script><img src=x onerror=alert(1)>'
    const html = reviewHtml(
      {
        name: 'set-x',
        createdAt: '2026-10-12T00:00:00Z',
        sample: { days: 1, seeds: [], neighbourMin: 0.8, randomCount: 0 },
        articles: [
          {
            id: 'art_1',
            publisher: 'P',
            publisherKind: 'newsroom',
            title,
            description: null,
            publishedAt: '2026-10-12T00:00:00Z',
          },
        ],
      },
      {
        set: 'set-x',
        guide: 'docs/story-granularity.md',
        groups: [{ id: 'g1', title, articleIds: ['art_1'] }],
      },
    )
    // Only the page's own two closing script tags; the headline's is escaped inside the JSON.
    expect(html.match(/<\/script>/g)).toHaveLength(2)
    expect(html).not.toContain('<img src=x')
  })
})

describe('match evaluation', () => {
  const map = (o: Record<string, string>) => new Map(Object.entries(o))

  it('scores B-cubed precision (over-merging) and recall (fragmentation)', async () => {
    const { bcubed } = await import('@dn/jobs')
    const gold = map({ a: 'X', b: 'X', c: 'Y', d: 'Y' })
    expect(bcubed(gold, gold)).toMatchObject({ precision: 1, recall: 1, f1: 1 })
    // Everything in one story: perfect recall, half precision.
    const one = bcubed(map({ a: '1', b: '1', c: '1', d: '1' }), gold)
    expect(one.recall).toBe(1)
    expect(one.precision).toBe(0.5)
    // Everything split: perfect precision, half recall.
    const split = bcubed(map({ a: '1', b: '2', c: '3', d: '4' }), gold)
    expect(split.precision).toBe(1)
    expect(split.recall).toBe(0.5)
    expect(split).toMatchObject({ predictedSingletons: 4, labelledSingletons: 0 })
  })

  it('skips only when every candidate is below the gate threshold', async () => {
    const { evaluateCandidateGate } = await import('@dn/jobs')
    const example = (id: string, articleId: string, sameDevelopment: boolean, score: number) => ({
      id,
      articleId,
      candidateStoryId: `sty_${id}`,
      candidateRank: 1,
      sameDevelopment,
      score,
      features: {
        candidateCount: 1,
        topSimilarity: 0,
        nextSimilarity: 0,
        similarityGap: 0,
        centroidSimilarity: 0,
        firstSimilarity: 0,
        newestSimilarity: 0,
        cohesion: 1,
        nearestHours: 0,
        oldestHours: 0,
        candidateArticles: 1,
        samePublisher: false,
        titleTokenOverlap: 0,
        sharedNumbers: 0,
      },
    })
    const examples = [
      example('1', 'a', false, 0.01),
      example('2', 'b', true, 0.01),
      example('3', 'c', false, 0.2),
    ]
    const result = evaluateCandidateGate(examples, (candidate) => candidate.score, 0.05)
    expect(result).toEqual({
      articlesWithCandidates: 3,
      skippedArticles: 2,
      falseSkips: 1,
      skipRate: 2 / 3,
      falseSkipRate: 0.5,
    })
  })

  it('replays matching in publish order with the production decision rules', async () => {
    const { replayMatching } = await import('@dn/jobs')
    const at = (h: number) => new Date(Date.UTC(2026, 9, 12, h)).toISOString()
    const articles = [
      { id: 'a', publishedAt: at(1), embedding: [1, 0] },
      { id: 'b', publishedAt: at(2), embedding: [0.99, 0.14] }, // very close to a: attaches without the model
      { id: 'c', publishedAt: at(3), embedding: [0.8, 0.6] }, // mid band: the model decides
      { id: 'd', publishedAt: at(4), embedding: [0, 1] }, // far from all: new story
    ]
    const asked: string[] = []
    const policy = {
      autoSame: 0.95,
      llmMin: 0.7,
      maxCandidates: 3,
      storyArticles: 'newest' as const,
      ranking: 'best' as const,
      judging: 'sequential' as const,
    }
    const run = () =>
      replayMatching(
        articles,
        policy,
        { neighbours: 12, windowSeconds: 86_400 },
        async (id) => {
          asked.push(id)
          return id === 'c'
        },
        async () => null,
      )
    const result = await run()
    expect(result.get('b')).toBe(result.get('a'))
    expect(result.get('c')).toBe(result.get('a'))
    expect(result.get('d')).not.toBe(result.get('a'))
    expect(asked).toEqual(['c'])
    // Deterministic: the same inputs give the same stories.
    expect([...(await run())]).toEqual([...result])
  })

  it('choose judging asks once with all candidates and takes its pick, or none', async () => {
    const { decideMatch } = await import('@dn/jobs')
    const policy = {
      autoSame: 0.95,
      llmMin: 0.7,
      maxCandidates: 2,
      storyArticles: 'anchored' as const,
      ranking: 'best' as const,
      judging: 'choose' as const,
    }
    const ranked: [string, number][] = [
      ['s1', 0.9],
      ['s2', 0.85],
      ['s3', 0.8],
    ]
    const seen: string[][] = []
    const pick = (id: string | null) => async (ids: string[]) => {
      seen.push(ids)
      return { storyId: id }
    }
    const never = async () => {
      throw new Error('sequential judge must not run')
    }
    // Picks the second-ranked story, which "first yes wins" would never have reached.
    expect(await decideMatch(ranked, policy, never, pick('s2'))).toMatchObject({
      storyId: 's2',
      method: 'llm',
    })
    expect(seen[0]).toEqual(['s1', 's2'])
    expect(await decideMatch(ranked, policy, never, pick(null))).toBeNull()
    // A pick outside the candidates shown is ignored.
    expect(await decideMatch(ranked, policy, never, pick('s3'))).toBeNull()
  })

  it('omits only a clearly weak final candidate when configured', async () => {
    const { modelCandidates } = await import('@dn/jobs')
    const policy = {
      autoSame: 0.95,
      llmMin: 0.7,
      maxCandidates: 5,
      storyArticles: 'anchored' as const,
      ranking: 'best' as const,
      judging: 'choose' as const,
      tailCandidateMaxGap: 0.03,
    }
    expect(
      modelCandidates(
        [
          ['s1', 0.9],
          ['s2', 0.86],
          ['s3', 0.82],
          ['s4', 0.78],
          ['s5', 0.74],
        ],
        policy,
      ),
    ).toHaveLength(4)
    expect(
      modelCandidates(
        [
          ['s1', 0.9],
          ['s2', 0.86],
          ['s3', 0.82],
          ['s4', 0.78],
          ['s5', 0.76],
        ],
        policy,
      ),
    ).toHaveLength(5)
  })
})
