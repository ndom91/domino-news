import { readFileSync } from 'node:fs'
import {
  clockTime,
  dayLabel,
  formatDate,
  formatDateTime,
  hostnameOf,
  normalizeArticleUrl,
  pickLead,
  plural,
  recencyPeriod,
  regionForCountry,
  validateNewEdge,
  zoneName,
} from '@dn/domain'
import {
  findRspEntry,
  isStaleItem,
  isWireCopy,
  parseFeed,
  parseRspWikitext,
  wikidataEvidence,
} from '@dn/jobs'
import { clampWeight, decayed, scoreStory } from '@dn/server'
import { cx, layoutNarrative, storiesPerDay, THEME_TOKENS } from '@dn/ui'
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
|}`
    const entries = parseRspWikitext(wikitext)
    expect(entries).toEqual([
      { name: 'The New York Times', status: 'Generally reliable', domains: ['nytimes.com'] },
      {
        name: 'Daily Mail',
        status: 'Deprecated',
        domains: ['dailymail.co.uk', 'mailonsunday.co.uk'],
      },
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
