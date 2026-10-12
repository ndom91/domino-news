import type {
  CoverageProfile,
  Desk,
  DevelopingNarrative,
  NarrativeDetail,
  PublisherAssessment,
  StoryDetail,
  StoryListItem,
} from '@dn/schemas'

// Deterministic Playroom/test fixtures mirroring the design handoff's reference page
// (fictional publishers and stories). Times are hours before fixtureNow.

export const fixtureNow = '2026-10-10T13:50:00.000Z'
const ago = (h: number) => new Date(Date.parse(fixtureNow) - h * 3_600_000).toISOString()

const pub = (slug: string, name: string) => ({
  id: `pub_${slug}`,
  slug,
  name,
  domain: `${slug}.example`,
})
const P = {
  meridian: pub('meridian', 'Meridian Wire'),
  halden: pub('halden', 'Halden Post'),
  southbank: pub('southbank', 'Southbank Herald'),
  brightwater: pub('brightwater', 'Brightwater Public Radio'),
  civic: pub('civic', 'The Civic Record'),
  lakeshore: pub('lakeshore', 'Lakeshore Times'),
  calder: pub('calder', 'Calder Review'),
  ostend: pub('ostend', 'Ostend Daily'),
  eastline: pub('eastline', 'Eastline News'),
}
type Pub = (typeof P)[keyof typeof P]

// Desk per fixture Story id; the rest are politics.
const DESK: Record<string, Desk> = {
  'union-files-appeal': 'justice',
  'port-workers-vote': 'economy',
  'central-bank-holds': 'economy',
  'ridership-revised': 'justice',
  'wildfire-smoke-alerts': 'science',
  'hydropower-curbs': 'science',
  'hospital-it-outage': 'science',
}

const NARR = {
  harrowgate: {
    id: 'nar_harrowgate',
    slug: 'harrowgate-transit-dispute',
    title: 'Harrowgate transit dispute',
    desk: 'justice' as const,
  },
  rates: {
    id: 'nar_rates',
    slug: 'rate-path',
    title: 'Rate path after the summer inflation spike',
    desk: 'economy' as const,
  },
  dataBill: {
    id: 'nar_data_bill',
    slug: 'data-retention-bill',
    title: 'Data-retention bill',
    desk: 'politics' as const,
  },
}

type Src = [Pub, number, number | null] // outlet, hours ago, citation
const S = (p: Pub, h: number, cite: number | null = null): Src => [p, h, cite]

function story(
  id: string,
  title: string,
  summary: string,
  sources: Src[],
  extra: Partial<StoryListItem> = {},
): StoryListItem {
  const times = sources.map(([, h]) => h)
  return {
    id: `sty_${id}`,
    slug: id,
    title,
    summary,
    status: 'developing',
    firstObservedAt: ago(Math.max(...times)),
    lastUpdatedAt: ago(Math.min(...times)),
    sourceCount: sources.length,
    regions: ['europe'],
    topics: [],
    desk: DESK[id] ?? 'politics',
    publishers: sources.map(([p]) => p),
    narratives: [],
    trace: sources.map(([p, h, cite], i) => ({
      id: `art_${id}_${i}`,
      publisherName: p.name,
      at: ago(h),
      citation: cite,
    })),
    relation: null,
    primarySource: null,
    correction: false,
    ...extra,
  }
}

export const fixtureLatest: StoryListItem[] = [
  story(
    'union-files-appeal',
    'Union files emergency appeal against strike injunction',
    'The Rail & Signal Workers’ Union lodged an appeal on Saturday morning, arguing the injunction was granted without hearing its safety evidence, Southbank Herald reports[1]. No hearing date has been set[2].',
    [S(P.southbank, 1.4, 1), S(P.meridian, 0.9, 2), S(P.lakeshore, 0.4)],
    {
      narratives: [NARR.harrowgate],
      relation: {
        type: 'branches_from',
        slug: 'court-halts-harrowgate-rail-strike',
        title: 'Court halts Harrowgate rail strike…',
      },
    },
  ),
  story(
    'port-workers-vote',
    'Port workers schedule vote on solidarity action',
    'Dockworkers at Harrowgate port will vote on Tuesday on whether to join rail staff in industrial action, Lakeshore Times reports[1].',
    [S(P.lakeshore, 1.1, 1)],
    {
      narratives: [NARR.harrowgate],
      relation: {
        type: 'related_to',
        slug: 'court-halts-harrowgate-rail-strike',
        title: 'Court halts Harrowgate rail strike…',
      },
    },
  ),
  story(
    'central-bank-holds',
    'Central bank holds rates, signals possible cut in December',
    'The central bank kept its policy rate at 3.75 percent and said a December cut was “on the table” if core inflation keeps easing, according to Meridian Wire[1] and Ostend Daily[2].',
    [
      S(P.meridian, 5.2, 1),
      S(P.ostend, 5.0, 2),
      S(P.halden, 4.6),
      S(P.calder, 4.1, 3),
      S(P.civic, 3.8),
      S(P.southbank, 3.3),
      S(P.eastline, 3.0, 4),
      S(P.lakeshore, 2.6),
      S(P.brightwater, 2.2, 5),
    ],
    {
      narratives: [NARR.rates],
      relation: {
        type: 'follows',
        slug: 'core-inflation-falls',
        title: 'Core inflation falls for a third month',
      },
    },
  ),
  story(
    'ridership-revised',
    'Transit authority revises ridership figures cited in strike talks',
    'Harrowgate Transit cut its 2025 ridership estimate by 12 percent, The Civic Record reports[1]. The earlier figure appeared in a Story from 2 October, now marked as corrected.',
    [S(P.civic, 3.6, 1), S(P.halden, 3.1)],
    {
      narratives: [NARR.harrowgate],
      relation: {
        type: 'corrects',
        slug: 'ridership-recovered',
        title: 'Ridership has fully recovered, authority says',
      },
      correction: true,
    },
  ),
  story(
    'wildfire-smoke-alerts',
    'Wildfire smoke triggers air-quality alerts in three provinces',
    'Environment agencies issued alerts across the northern provinces as smoke from 40 active fires drifted south, according to Brightwater Public Radio[1] and Eastline News[2].',
    [
      S(P.brightwater, 7.9, 1),
      S(P.eastline, 7.1, 2),
      S(P.lakeshore, 6.0, 3),
      S(P.halden, 5.5),
      S(P.ostend, 4.4),
    ],
  ),
  story(
    'data-retention-committee',
    'Parliament committee advances data-retention bill',
    'The justice committee approved Bill C-41 with two amendments narrowing access by local police, The Civic Record reports[1]; Calder Review says a final vote could come next month[2].',
    [S(P.civic, 6.2, 1), S(P.calder, 4.9, 2)],
    {
      narratives: [NARR.dataBill],
      relation: {
        type: 'follows',
        slug: 'privacy-regulator',
        title: 'Privacy regulator criticises draft bill',
      },
      primarySource: {
        title: 'Bill C-41, as amended in committee',
        url: 'https://parliament.example/c-41',
      },
    },
  ),
  story(
    'hydropower-curbs',
    'Drought forces hydropower curbs across the northern grid',
    'Grid operator Nordvolt cut hydro output by a fifth after the driest September on record, according to Ostend Daily[1] and Eastline News[2].',
    [S(P.ostend, 11.3, 1), S(P.eastline, 10.2, 2), S(P.meridian, 8.8), S(P.halden, 6.9)],
  ),
  story(
    'hospital-it-outage',
    'Hospital network delays elective surgeries after IT outage',
    'Riverside Health postponed about 300 procedures after its scheduling system went offline on Friday, Halden Post reports[1]. The network says patient records were not affected[2].',
    [
      S(P.halden, 15.5, 1),
      S(P.southbank, 13.2, 2),
      S(P.meridian, 12.8),
      S(P.civic, 9.1, 3),
      S(P.brightwater, 8.4),
      S(P.eastline, 7.7),
    ],
  ),
]

const leadSources: Src[] = [
  S(P.meridian, 19.75, 1),
  S(P.halden, 19.05),
  S(P.southbank, 17.45, 2),
  S(P.brightwater, 14.25),
  S(P.civic, 9.95, 3),
  S(P.lakeshore, 6.65),
  S(P.calder, 2.15, 4),
]

export const fixtureLead: StoryDetail = {
  id: 'sty_court_halts',
  slug: 'court-halts-harrowgate-rail-strike',
  title: 'Court halts Harrowgate rail strike hours before walkout',
  status: 'developing',
  firstObservedAt: ago(19.75),
  lastUpdatedAt: ago(2.15),
  publishedAt: ago(19),
  regions: ['europe'],
  topics: ['courts', 'rights'],
  desk: 'justice',
  summary: {
    versionId: 'sum_lead',
    headline: 'Court halts Harrowgate rail strike hours before walkout',
    body: 'A regional court granted Harrowgate Transit an injunction suspending a 48-hour strike by the Rail & Signal Workers’ Union, according to Meridian Wire[1] and The Civic Record[3]. The union said it would appeal[2]. Calder Review reports the ruling cites unresolved safety-staffing talks[4]; the ruling text has not yet been published.',
    detail:
      'The union called the walkout after talks on minimum staffing for signal boxes broke down last month, Meridian Wire reports[1]. Harrowgate Transit argued the strike notice was served too late[3].\n\nThe union’s appeal is expected to be heard within days, according to The Civic Record[3]. Until then, services run to the normal timetable.',
    format: 'paragraph',
    createdAt: ago(1.1),
    origin: 'generated',
    modelId: 'gemma-4-26B-A4B',
    citedArticleIds: leadSources.flatMap(([, , c], i) => (c ? [`art_lead_${i}`] : [])),
  },
  summaryHistory: [{ versionId: 'sum_lead', createdAt: ago(1.1), origin: 'generated' }],
  sources: leadSources.map(([p, h, cite], i) => ({
    articleId: `art_lead_${i}`,
    title: 'Court halts Harrowgate rail strike hours before walkout',
    description: 'A regional court granted an injunction suspending the 48-hour strike.',
    url: `https://${p.domain}/harrowgate-${i}`,
    publishedAt: ago(h),
    observedAt: ago(h),
    publisher: p,
    official: false,
    citedInSummary: cite !== null,
    citation: cite,
  })),
  related: [
    {
      id: 'sty_union-files-appeal',
      slug: 'union-files-appeal',
      title: 'Union files emergency appeal against strike injunction',
      relation: 'branches_from',
      direction: 'incoming',
      lastUpdatedAt: ago(0.4),
    },
  ],
  narratives: [NARR.harrowgate],
  primarySources: [],
  context: [
    {
      id: 'ctx_rsw',
      title: 'Rail & Signal Workers’ Union',
      kind: 'background',
      anchorText: 'Rail & Signal Workers’ Union',
      explanation: 'The largest union of train drivers and signal staff in the Harrowgate region.',
      sources: [
        {
          articleId: 'art_lead_0',
          publisherName: 'Meridian Wire',
          title: 'Court halts…',
          url: 'https://meridian.example/1',
        },
      ],
    },
  ],
  claims: [
    {
      id: 'clm_1',
      proposition: 'A regional court suspended the 48-hour rail strike.',
      createdAt: ago(1),
      firstReportedAt: ago(5),
      mentions: [
        { stance: 'asserts', articleId: 'art_lead_0', publisher: P.meridian },
        { stance: 'asserts', articleId: 'art_lead_4', publisher: P.civic },
      ],
      evidence: [],
    },
    {
      id: 'clm_2',
      proposition: 'The union will appeal the injunction.',
      createdAt: ago(1),
      firstReportedAt: ago(5),
      mentions: [{ stance: 'quotes', articleId: 'art_lead_2', publisher: P.southbank }],
      evidence: [],
    },
  ],
  leanMix: [
    {
      country: 'GB',
      publishers: [
        { publisher: P.halden, lean: 'centre_left', estimated: false },
        { publisher: P.southbank, lean: 'left', estimated: false },
        { publisher: P.brightwater, lean: 'left', estimated: false },
        { publisher: P.civic, lean: 'centre_left', estimated: true },
        { publisher: P.lakeshore, lean: null, estimated: false },
        { publisher: P.calder, lean: null, estimated: false },
      ],
      oneSided: 'left',
    },
    {
      country: 'IE',
      publishers: [{ publisher: P.meridian, lean: null, estimated: false }],
      oneSided: null,
    },
  ],
}

export const fixtureDeveloping: DevelopingNarrative[] = [
  {
    ...NARR.harrowgate,
    storyCount: 6,
    since: '2026-10-02T09:00:00.000Z',
    updatedAt: ago(0.4),
    steps: [
      {
        storyId: 'h1',
        slug: 'ridership-recovered',
        title: 'Ridership has fully recovered, authority says',
        firstObservedAt: '2026-10-02T09:00:00.000Z',
        relation: null,
        correctedAt: '2026-10-10T10:00:00.000Z',
      },
      {
        storyId: 'h2',
        slug: 'talks-collapse',
        title: 'Talks collapse over safety staffing',
        firstObservedAt: '2026-10-06T09:00:00.000Z',
        relation: null,
        correctedAt: null,
      },
      {
        storyId: 'h3',
        slug: 'court-halts-harrowgate-rail-strike',
        title: 'Court halts rail strike hours before walkout',
        firstObservedAt: '2026-10-09T18:00:00.000Z',
        relation: null,
        correctedAt: null,
      },
      {
        storyId: 'h4',
        slug: 'union-files-appeal',
        title: 'Union files emergency appeal',
        firstObservedAt: '2026-10-10T12:00:00.000Z',
        relation: { type: 'branches_from', title: 'the ruling', at: '2026-10-09T18:00:00.000Z' },
        correctedAt: null,
      },
      {
        storyId: 'h5',
        slug: 'ridership-revised',
        title: 'Authority revises ridership figures',
        firstObservedAt: '2026-10-10T10:00:00.000Z',
        relation: {
          type: 'corrects',
          title: 'Ridership has fully recovered',
          at: '2026-10-02T09:00:00.000Z',
        },
        correctedAt: null,
      },
    ],
  },
  {
    ...NARR.rates,
    storyCount: 5,
    since: '2026-08-14T09:00:00.000Z',
    updatedAt: ago(2.2),
    steps: [
      {
        storyId: 'r1',
        slug: 'inflation-hits',
        title: 'Inflation hits 4.1%, highest in two years',
        firstObservedAt: '2026-08-14T09:00:00.000Z',
        relation: null,
        correctedAt: null,
      },
      {
        storyId: 'r2',
        slug: 'bank-raises',
        title: 'Central bank raises rate to 3.75%',
        firstObservedAt: '2026-09-11T09:00:00.000Z',
        relation: null,
        correctedAt: null,
      },
      {
        storyId: 'r3',
        slug: 'core-inflation-falls',
        title: 'Core inflation falls for a third month',
        firstObservedAt: '2026-10-08T09:00:00.000Z',
        relation: null,
        correctedAt: null,
      },
      {
        storyId: 'r4',
        slug: 'central-bank-holds',
        title: 'Central bank holds, signals December cut',
        firstObservedAt: '2026-10-10T09:00:00.000Z',
        relation: {
          type: 'follows',
          title: 'Core inflation falls',
          at: '2026-10-08T09:00:00.000Z',
        },
        correctedAt: null,
      },
    ],
  },
  {
    ...NARR.dataBill,
    storyCount: 4,
    since: '2026-09-19T09:00:00.000Z',
    updatedAt: ago(4.8),
    steps: [
      {
        storyId: 'd1',
        slug: 'bill-published',
        title: 'Government publishes Bill C-41',
        firstObservedAt: '2026-09-19T09:00:00.000Z',
        relation: null,
        correctedAt: null,
      },
      {
        storyId: 'd2',
        slug: 'telecoms-warn',
        title: 'Telecoms warn of storage costs',
        firstObservedAt: '2026-09-26T09:00:00.000Z',
        relation: null,
        correctedAt: null,
      },
      {
        storyId: 'd3',
        slug: 'privacy-regulator',
        title: 'Privacy regulator criticises draft',
        firstObservedAt: '2026-10-03T09:00:00.000Z',
        relation: null,
        correctedAt: null,
      },
      {
        storyId: 'd4',
        slug: 'data-retention-committee',
        title: 'Committee advances bill with amendments',
        firstObservedAt: '2026-10-10T09:00:00.000Z',
        relation: {
          type: 'follows',
          title: 'Privacy regulator criticises draft',
          at: '2026-10-03T09:00:00.000Z',
        },
        correctedAt: null,
      },
    ],
  },
]

export const fixtureNarrative: NarrativeDetail = {
  ...NARR.harrowgate,
  description:
    'Tracks the Harrowgate rail strike, the court injunction and the disputed ridership figures.',
  createdAt: '2026-10-02T09:00:00.000Z',
  updatedAt: ago(0.4),
  stories: [
    {
      id: 'sty_icc',
      slug: 'talks-collapse',
      title: 'Talks collapse over safety staffing',
      summary: 'Negotiations ended without agreement, Meridian Wire reports[1].',
      firstObservedAt: '2026-10-06T09:00:00.000Z',
      lastUpdatedAt: '2026-10-06T12:00:00.000Z',
      sourceCount: 3,
    },
    {
      id: 'sty_pillay',
      slug: 'court-halts-harrowgate-rail-strike',
      title: 'Court halts Harrowgate rail strike hours before walkout',
      summary: 'A regional court granted an injunction[1].',
      firstObservedAt: ago(19.75),
      lastUpdatedAt: ago(2.15),
      sourceCount: 7,
    },
    {
      id: 'sty_trump',
      slug: 'ridership-revised',
      title: 'Transit authority revises ridership figures cited in strike talks',
      summary: 'Harrowgate Transit cut its ridership estimate[1].',
      firstObservedAt: ago(3.6),
      lastUpdatedAt: ago(3.1),
      sourceCount: 2,
    },
    {
      id: 'sty_reax',
      slug: 'union-files-appeal',
      title: 'Union files emergency appeal against strike injunction',
      summary: null,
      firstObservedAt: ago(1.4),
      lastUpdatedAt: ago(0.4),
      sourceCount: 3,
    },
  ],
  edges: [
    { id: 'e1', fromStoryId: 'sty_pillay', toStoryId: 'sty_icc', relation: 'follows' },
    { id: 'e2', fromStoryId: 'sty_trump', toStoryId: 'sty_pillay', relation: 'related_to' },
    { id: 'e3', fromStoryId: 'sty_reax', toStoryId: 'sty_pillay', relation: 'branches_from' },
  ],
}

export const fixtureAssessment: PublisherAssessment = {
  id: 'pas_1',
  methodologyVersion: 'assessment@1',
  countryContext: 'GB',
  fundingModel: 'public_broadcaster',
  ownership:
    'Public corporation funded mainly by the UK licence fee; editorially independent by charter.',
  reliabilityLevel: 'reliable',
  reliability: 'Generally reliable per Wikipedia editors; opinion pieces judged separately.',
  lean: 'centre',
  leanBasis: 'sourced',
  leanEvidenceUrl: 'https://reutersinstitute.politics.ox.ac.uk/digital-news-report',
  leanNote: 'Audience close to the UK average (Reuters Institute, audience self-placement).',
  evidence: [
    {
      source: 'wikidata',
      dimension: 'ownership',
      value: 'Owned by British Broadcasting Corporation (public broadcaster)',
      url: 'https://www.wikidata.org/wiki/Q9531',
    },
    {
      source: 'wp_rsp',
      dimension: 'reliability',
      value: 'Generally reliable (Wikipedia perennial sources: BBC)',
      url: 'https://en.wikipedia.org/wiki/Wikipedia:Reliable_sources/Perennial_sources',
    },
  ],
  reviewedAt: '2026-10-11T09:00:00.000Z',
}

export const fixtureAssessmentUnrated: PublisherAssessment = {
  ...fixtureAssessment,
  id: 'pas_2',
  countryContext: 'RU',
  fundingModel: 'state',
  ownership: 'Owned and funded by the Russian state.',
  reliabilityLevel: 'deprecated',
  reliability: 'Deprecated by Wikipedia editors for publishing fabricated information.',
  lean: null,
  leanBasis: null,
  leanEvidenceUrl: null,
  leanNote: null,
  evidence: [],
}

export const fixtureCoverageProfile: CoverageProfile = {
  days: 30,
  storyCount: 64,
  desks: [
    { key: 'politics', share: 0.38, overallShare: 0.27 },
    { key: 'conflict', share: 0.22, overallShare: 0.19 },
    { key: 'economy', share: 0.14, overallShare: 0.21 },
    { key: 'science', share: 0.11, overallShare: 0.16 },
    { key: 'justice', share: 0.09, overallShare: 0.1 },
    { key: 'culture', share: 0.06, overallShare: 0.07 },
  ],
  regions: [
    { key: 'europe', share: 0.41, overallShare: 0.24 },
    { key: 'north-america', share: 0.23, overallShare: 0.38 },
    { key: 'middle-east', share: 0.17, overallShare: 0.14 },
    { key: 'africa', share: 0.08, overallShare: 0.06 },
  ],
  officialShare: 0.18,
  missedMajor: {
    count: 2,
    examples: [
      { id: 'sty_a', slug: 'ceasefire-talks-resume', title: 'Ceasefire talks resume in Doha' },
      { id: 'sty_b', slug: 'central-bank-holds-rates', title: 'Central bank holds rates steady' },
    ],
  },
}
