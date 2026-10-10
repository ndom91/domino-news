import type { CoverageMatrix, NarrativeDetail, StoryDetail, StoryListItem } from '@dn/schemas'

// Deterministic view-model fixtures for Playroom and component tests. Headlines mirror the
// RSS fixture set; summaries are illustrative.

const pub = (slug: string, name: string, domain: string) => ({
  id: `pub_${slug}`,
  slug,
  name,
  domain,
})
export const fixturePublishers = {
  guardian: pub('guardian', 'The Guardian', 'theguardian.com'),
  nyt: pub('nytimes', 'The New York Times', 'nytimes.com'),
  wapo: pub('washingtonpost', 'The Washington Post', 'washingtonpost.com'),
  france24: pub('france24', 'France 24', 'france24.com'),
  bbc: pub('bbc', 'BBC News', 'bbc.co.uk'),
  aljazeera: pub('aljazeera', 'Al Jazeera', 'aljazeera.com'),
}

const narrativeRef = {
  id: 'nar_nobel',
  slug: 'nobel-peace-prize-2026',
  title: 'Nobel Peace Prize 2026',
}

export const fixtureStory: StoryListItem = {
  id: 'sty_pillay',
  slug: 'navi-pillay-wins-nobel-peace-prize',
  title: 'Navi Pillay, former UN rights chief, awarded the Nobel Peace Prize',
  summary:
    'The Norwegian Nobel Committee awarded the 2026 Peace Prize to Navi Pillay, the South African jurist and former UN High Commissioner for Human Rights, according to The Guardian and The New York Times. France 24 reports the committee cited her work on accountability for war crimes.',
  status: 'developing',
  firstObservedAt: '2026-10-09T09:05:00.000Z',
  lastUpdatedAt: '2026-10-09T15:40:00.000Z',
  sourceCount: 4,
  publishers: [
    fixturePublishers.nyt,
    fixturePublishers.wapo,
    fixturePublishers.guardian,
    fixturePublishers.france24,
  ],
  narratives: [narrativeRef],
  trace: [
    { id: 'a1', publisherName: 'The New York Times', at: '2026-10-09T09:05:00.000Z' },
    { id: 'a2', publisherName: 'The Guardian', at: '2026-10-09T09:20:00.000Z' },
    { id: 'a3', publisherName: 'France 24', at: '2026-10-09T11:02:00.000Z' },
    { id: 'a4', publisherName: 'The Washington Post', at: '2026-10-09T15:40:00.000Z' },
  ],
}

export const fixtureStorySingle: StoryListItem = {
  id: 'sty_quake',
  slug: 'panama-earthquake',
  title: 'Magnitude 7.7 earthquake strikes off Panama',
  summary:
    'A strong earthquake struck off the coast of Panama on Friday, the BBC reports. There were no immediate reports of casualties.',
  status: 'developing',
  firstObservedAt: '2026-10-10T02:10:00.000Z',
  lastUpdatedAt: '2026-10-10T02:10:00.000Z',
  sourceCount: 1,
  publishers: [fixturePublishers.bbc],
  narratives: [],
  trace: [{ id: 'b1', publisherName: 'BBC News', at: '2026-10-10T02:10:00.000Z' }],
}

export const fixtureTrace = [
  { id: 'a1', publisherName: 'The New York Times', at: '2026-10-09T09:05:00.000Z', cited: true },
  { id: 'a2', publisherName: 'The Guardian', at: '2026-10-09T09:20:00.000Z', cited: true },
  { id: 'a3', publisherName: 'France 24', at: '2026-10-09T11:02:00.000Z', cited: true },
  { id: 'a4', publisherName: 'The Washington Post', at: '2026-10-09T15:40:00.000Z', cited: false },
]

export const fixtureStoryDetail: StoryDetail = {
  ...fixtureStory,
  publishedAt: '2026-10-09T09:30:00.000Z',
  summary: {
    versionId: 'sum_2',
    headline: fixtureStory.title,
    body: fixtureStory.summary ?? '',
    format: 'paragraph',
    createdAt: '2026-10-09T15:42:00.000Z',
    origin: 'generated',
    modelId: 'gemma-4-26B-A4B',
    citedArticleIds: ['a1', 'a2', 'a3'],
  },
  summaryHistory: [
    { versionId: 'sum_2', createdAt: '2026-10-09T15:42:00.000Z', origin: 'generated' },
    { versionId: 'sum_1', createdAt: '2026-10-09T09:30:00.000Z', origin: 'generated' },
  ],
  sources: fixtureTrace.map((t, i) => ({
    articleId: t.id,
    title: [
      'Navi Pillay Wins Nobel Peace Prize',
      'Navi Pillay, former UN human rights chief, wins Nobel peace prize',
      'Former UN rights chief Navi Pillay awarded Nobel Peace Prize',
      'Nobel Peace Prize goes to Navi Pillay, a champion of international justice',
    ][i] as string,
    description: 'The South African jurist led the UN human rights office from 2008 to 2014.',
    url: `https://example.com/${t.id}`,
    publishedAt: t.at,
    observedAt: t.at,
    publisher:
      Object.values(fixturePublishers).find((p) => p.name === t.publisherName) ??
      fixturePublishers.guardian,
    citedInSummary: t.cited,
  })),
  related: [
    {
      id: 'sty_trump',
      slug: 'trump-attacks-norway',
      title: 'Trump attacks Norway over Nobel snub',
      relation: 'responds_to',
      direction: 'incoming',
      lastUpdatedAt: '2026-10-10T07:00:00.000Z',
    },
  ],
  primarySources: [],
  claims: [
    {
      id: 'clm_1',
      proposition: 'The Norwegian Nobel Committee awarded the 2026 Peace Prize to Navi Pillay.',
      mentions: [
        { stance: 'asserts', articleId: 'a1', publisher: fixturePublishers.nyt },
        { stance: 'asserts', articleId: 'a2', publisher: fixturePublishers.guardian },
        { stance: 'asserts', articleId: 'a3', publisher: fixturePublishers.france24 },
      ],
      evidence: [],
    },
    {
      id: 'clm_2',
      proposition: "The committee cited Pillay's work on accountability for war crimes.",
      mentions: [
        { stance: 'quotes', articleId: 'a3', publisher: fixturePublishers.france24 },
        { stance: 'discusses', articleId: 'a4', publisher: fixturePublishers.wapo },
      ],
      evidence: [],
    },
  ],
  context: [
    {
      id: 'ctx_icc',
      title: 'UN High Commissioner for Human Rights',
      kind: 'background',
      anchorText: 'UN High Commissioner for Human Rights',
      explanation:
        'The United Nations official who leads its human rights office in Geneva. Pillay held the post from 2008 to 2014.',
      sources: [
        {
          articleId: 'a2',
          publisherName: 'The Guardian',
          title: 'Navi Pillay wins Nobel peace prize',
          url: 'https://example.com/a2',
        },
      ],
    },
  ],
}

export const fixtureNarrative: NarrativeDetail = {
  id: narrativeRef.id,
  slug: narrativeRef.slug,
  title: narrativeRef.title,
  description:
    'Tracks the 2026 Peace Prize, reactions to it, and the related fight over the International Criminal Court.',
  createdAt: '2026-10-09T10:00:00.000Z',
  updatedAt: '2026-10-10T07:00:00.000Z',
  stories: [
    {
      id: 'sty_icc',
      slug: 'us-sanctions-icc',
      title: 'US expands sanctions on International Criminal Court officials',
      summary: 'Washington widened sanctions on ICC judges, the BBC and DW report.',
      firstObservedAt: '2026-10-08T18:00:00.000Z',
      lastUpdatedAt: '2026-10-08T20:00:00.000Z',
      sourceCount: 3,
    },
    {
      id: fixtureStory.id,
      slug: fixtureStory.slug,
      title: fixtureStory.title,
      summary: fixtureStory.summary,
      firstObservedAt: fixtureStory.firstObservedAt,
      lastUpdatedAt: fixtureStory.lastUpdatedAt,
      sourceCount: 4,
    },
    {
      id: 'sty_trump',
      slug: 'trump-attacks-norway',
      title: 'Trump attacks Norway over Nobel snub',
      summary:
        'The US president criticised Norway after the prize went to Pillay, according to the BBC.',
      firstObservedAt: '2026-10-10T06:30:00.000Z',
      lastUpdatedAt: '2026-10-10T07:00:00.000Z',
      sourceCount: 4,
    },
    {
      id: 'sty_reax',
      slug: 'icc-welcomes-prize',
      title: 'ICC judges welcome prize as a rebuke to sanctions',
      summary: null,
      firstObservedAt: '2026-10-10T09:00:00.000Z',
      lastUpdatedAt: '2026-10-10T09:00:00.000Z',
      sourceCount: 1,
    },
  ],
  edges: [
    { id: 'e1', fromStoryId: 'sty_trump', toStoryId: fixtureStory.id, relation: 'responds_to' },
    { id: 'e2', fromStoryId: fixtureStory.id, toStoryId: 'sty_icc', relation: 'related_to' },
    { id: 'e3', fromStoryId: 'sty_reax', toStoryId: fixtureStory.id, relation: 'branches_from' },
    { id: 'e4', fromStoryId: 'sty_reax', toStoryId: 'sty_icc', relation: 'responds_to' },
  ],
}

export const fixtureCoverage: CoverageMatrix = {
  publishers: Object.values(fixturePublishers),
  stories: [
    {
      id: fixtureStory.id,
      slug: fixtureStory.slug,
      title: fixtureStory.title,
      lastUpdatedAt: fixtureStory.lastUpdatedAt,
      coverage: [
        { publisherId: 'pub_nytimes', first: true },
        { publisherId: 'pub_guardian', first: false },
        { publisherId: 'pub_france24', first: false },
        { publisherId: 'pub_washingtonpost', first: false },
      ],
    },
    {
      id: 'sty_trump',
      slug: 'trump-attacks-norway',
      title: 'Trump attacks Norway over Nobel snub',
      lastUpdatedAt: '2026-10-10T07:00:00.000Z',
      coverage: [
        { publisherId: 'pub_bbc', first: true },
        { publisherId: 'pub_guardian', first: false },
        { publisherId: 'pub_aljazeera', first: false },
      ],
    },
  ],
}
