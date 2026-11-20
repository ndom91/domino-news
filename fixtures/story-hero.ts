import type { StoryDetail } from '@dn/schemas'

/** Fictional, deterministic design states shared by Playroom and the native dev screen. */
export const storyHeroNow = '2026-11-19T12:48:00.000Z'
export const storyHeroStates = [
  'long',
  'extra',
  'short',
  'updating',
  'dark',
  'dark-long',
  'none',
] as const
export type StoryHeroState = (typeof storyHeroStates)[number]
const names = [
  'Meridian Wire',
  'Ostend Daily',
  'Halden Post',
  'Calder Review',
  'The Civic Record',
  'Southbank Herald',
  'Eastline News',
  'Lakeshore Times',
]
const ago = (hours: number) => new Date(Date.parse(storyHeroNow) - hours * 3_600_000).toISOString()
const base = {
  id: 'story-preview',
  slug: 'story-preview',
  title: '',
  status: 'developing',
  firstObservedAt: ago(5.2),
  lastUpdatedAt: ago(0.1),
  publishedAt: ago(5),
  desk: 'economy',
  regions: ['europe'],
  topics: [],
  summaryHistory: [],
  related: [],
  primarySources: [],
  context: [],
  narratives: [],
  leanMix: [],
  summary: {
    versionId: 'summary-preview',
    headline: '',
    body: '',
    detail: null,
    format: 'paragraph',
    createdAt: ago(7 / 60),
    origin: 'generated',
    modelId: 'fixture',
    citedArticleIds: [],
  },
  sources: names.map((name, index) => ({
    articleId: `preview-${index}`,
    title: `Reporting from ${name}`,
    description: null,
    url: `https://example.com/report-${index}`,
    publishedAt: ago(5.2 - index * 0.37),
    observedAt: ago(5.2 - index * 0.37),
    publisher: {
      id: `publisher-${index}`,
      slug: `publisher-${index}`,
      name,
      domain: 'example.com',
    },
    official: false,
    citedInSummary: [0, 1, 3, 6].includes(index),
    citation: [0, 1, 3, 6].includes(index) ? [0, 1, 3, 6].indexOf(index) + 1 : null,
  })),
} satisfies StoryDetail
const content = {
  long: {
    desk: 'economy',
    title: 'Central bank holds rates, signals possible cut in December',
    narrative: 'Rate path after the summer inflation spike',
    body: 'The central bank kept its policy rate at 3.75 percent and said a December cut was “on the table”, according to Meridian Wire[1] and Ostend Daily[2].',
    detail:
      'Core inflation has now fallen for three months in a row, to 2.9 percent in October[1]. Ostend Daily reports that two of the nine committee members voted for an immediate cut[2].\n\nCalder Review says mortgage lenders had already started pricing in a December move[3], while Eastline News reports that the currency fell 0.4 percent against the euro after the statement[4].\n\nThe bank’s next decision is due on 17 December. Its full minutes will be published in two weeks.',
  },
  extra: {
    desk: 'politics',
    title: 'Parliament committee advances data-retention bill',
    narrative: 'Data-retention bill',
    body: 'The justice committee approved Bill C-41 with two amendments narrowing access by local police, The Civic Record reports[1].',
    detail:
      'Calder Review reports that a final vote in the full chamber could come next month[2]. The government has said the bill will take effect six months after it passes.',
  },
  short: {
    desk: 'science',
    title: 'Wildfire smoke triggers air-quality alerts in three provinces',
    narrative: null,
    body: 'Environment agencies issued alerts across the northern provinces as smoke from 40 active fires drifted south, Brightwater Public Radio reports[1].',
    detail: null,
  },
  updating: {
    desk: 'justice',
    title: 'Court halts Harrowgate rail strike hours before walkout',
    narrative: 'Harrowgate transit dispute',
    body: 'A regional court granted Harrowgate Transit an injunction suspending a 48-hour strike by the Rail & Signal Workers’ Union, according to Meridian Wire[1] and The Civic Record[3]. The union said it would appeal[2]. Calder Review reports the ruling cites unresolved safety-staffing talks[4].',
    detail:
      'Harrowgate Transit runs the region’s four commuter rail lines and has been in talks with the union over night-shift safety staffing since August[2]. The strike would have been the first on the network in eleven years[1].\n\nThe operator says normal services will run in the meantime and that refunds issued for strike days will be honoured[3]. The ruling text has not yet been published.',
  },
  'dark-long': {
    desk: 'culture',
    title: 'Debut novelist wins the Halden Prize for fiction',
    narrative: null,
    body: 'The prize jury called the book “a quiet storm”, according to Southbank Herald[1].',
    detail:
      'The novel follows three generations of a family running a lighthouse on the northern coast. It was published by a small independent press in March and had sold fewer than 4,000 copies before the shortlist was announced[1].\n\nLakeshore Times reports that the publisher has ordered a reprint of 60,000 copies[2]. The prize is worth 50,000 euros.',
  },
  none: {
    desk: null,
    title: 'Ferry operator adds winter sailings to the islands',
    narrative: null,
    body: 'Coastline Ferries will run two extra daily crossings from December, Lakeshore Times reports[1].',
    detail:
      'The new sailings run until the end of February and use the larger of the operator’s two vessels[1]. Fares are unchanged.',
  },
  dark: {
    desk: 'conflict',
    title: 'Ceasefire monitors report shelling near northern border crossing',
    narrative: null,
    body: 'Monitors recorded 14 explosions overnight, Eastline News reports[1]; both sides deny firing first[2].',
    detail:
      'Ostend Daily reports that the crossing was closed to civilian traffic for six hours after the shelling. Neither side has requested an emergency session of the monitoring commission[1].',
  },
} satisfies Record<
  StoryHeroState,
  {
    desk: StoryDetail['desk']
    title: string
    narrative: string | null
    body: string
    detail: string | null
  }
>

export function storyHeroFixture(state: StoryHeroState): StoryDetail {
  const item = content[state]
  const count = { long: 8, extra: 2, short: 4, updating: 8, dark: 5, 'dark-long': 2, none: 2 }[
    state
  ]
  const sources = base.sources
    .slice(0, count)
    .map((source, index) =>
      state === 'extra' ? { ...source, citedInSummary: true, citation: index + 1 } : source,
    )
  return {
    ...base,
    context:
      state === 'long'
        ? [
            {
              id: 'preview-bank',
              anchorText: 'The central bank',
              title: 'Central bank',
              kind: 'definition',
              explanation: 'The institution responsible for setting monetary policy.',
              sources: [],
            },
            {
              id: 'preview-inflation',
              anchorText: 'Core inflation',
              title: 'Core inflation',
              kind: 'definition',
              explanation: 'A measure of price changes excluding food and energy.',
              sources: [],
            },
          ]
        : [],
    desk: item.desk,
    title: item.title,
    sources,
    summary: { ...base.summary, headline: item.title, body: item.body, detail: item.detail },
    narratives: item.narrative
      ? [
          {
            id: 'preview-narrative',
            slug: 'preview-narrative',
            title: item.narrative,
            desk: item.desk,
          },
        ]
      : [],
    ...(state === 'updating' ? { summaryUpdate: { newReports: 2 } } : {}),
  }
}
