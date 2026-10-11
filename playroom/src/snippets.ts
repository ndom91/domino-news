// Typed, deterministic snippets: variants, states and editorial compositions.
export default [
  {
    group: 'Button',
    name: 'Variants',
    code: '<div className="flex flex-wrap gap-3"><Button variant="primary">Save summary</Button><Button>Cancel</Button><Button variant="ghost">Show history</Button><Button variant="danger">Pause backfill</Button></div>',
  },
  {
    group: 'Button',
    name: 'States',
    code: '<div className="flex flex-wrap gap-3"><Button variant="primary" loading>Saving</Button><Button disabled>Disabled</Button><Button size="sm">Small</Button></div>',
  },
  {
    group: 'IconButton',
    name: 'Default',
    code: '<IconButton label="Search" icon={<span aria-hidden>⌕</span>} />',
  },
  {
    group: 'TextInput',
    name: 'Search',
    code: '<TextInput label="Search stories" hideLabel placeholder="Search stories and narratives" />',
  },
  {
    group: 'TextInput',
    name: 'Error',
    code: '<TextInput label="Username" defaultValue="x" error="Username must be at least 3 characters" />',
  },
  {
    group: 'Textarea',
    name: 'Summary editor',
    code: '<Textarea label="Summary" description="Saving creates a new version. Earlier versions are kept." defaultValue={fixtureLead.summary.body} />',
  },
  {
    group: 'Card',
    name: 'Plain and sunken',
    code: '<div className="grid gap-4 md:grid-cols-2"><Card>Plain card</Card><Card tone="sunken">Sunken panel</Card></div>',
  },
  {
    group: 'Badge',
    name: 'Tones',
    code: '<div className="flex gap-2"><Badge>Fixture</Badge><Badge tone="ink">Edited</Badge><Badge tone="success">OK</Badge><Badge tone="warning">Paused</Badge><Badge tone="error">Failed</Badge></div>',
  },
  {
    group: 'Popover',
    name: 'Context',
    code: '<Popover title="Navi Pillay" trigger={<button className="underline decoration-dotted">Navi Pillay</button>}>South African jurist; UN High Commissioner for Human Rights 2008–2014.</Popover>',
  },
  {
    group: 'Tooltip',
    name: 'Label',
    code: '<Tooltip content="Exact time: 9 Oct 2026, 09:05 UTC"><button className="type-meta">2 h ago</button></Tooltip>',
  },
  {
    group: 'Notice',
    name: 'Empty + error',
    code: '<div className="flex flex-col gap-6"><Notice title="No stories yet">Run the fixture ingest to populate the feed.</Notice><Notice tone="error" title="Could not load stories" action={<Button size="sm">Try again</Button>}>The API returned 503.</Notice></div>',
  },
  {
    group: 'Editorial',
    name: 'HeroStory',
    code: '<HeroStory story={fixtureLead} position={{ index: 3, total: 6 }} now={fixtureNow} />',
  },
  {
    group: 'Editorial',
    name: 'StoryItem wide',
    code: '<div className="grid gap-8 md:grid-cols-2"><StoryItem size="wide" story={fixtureLatest[0]} now={fixtureNow} /></div>',
  },
  {
    group: 'Editorial',
    name: 'StoryItem grid',
    code: '<div className="grid gap-x-8 gap-y-11 md:grid-cols-2 lg:grid-cols-4">{fixtureLatest.slice(2, 6).map((s) => <StoryItem key={s.id} story={s} now={fixtureNow} />)}</div>',
  },
  {
    group: 'Editorial',
    name: 'SourceTrace compact',
    code: '<SourceTrace now={fixtureNow} sources={fixtureLead.sources.map((s) => ({ id: s.articleId, outlet: s.publisher.name, at: s.publishedAt ?? s.observedAt, citation: s.citedInSummary ? (s.citation ?? 0) : null }))} />',
  },
  {
    group: 'Editorial',
    name: 'SourceBoard',
    code: '<div className="max-w-md"><SourceBoard sources={fixtureLead.sources.map((s) => ({ id: s.articleId, outlet: s.publisher.name, at: s.publishedAt ?? s.observedAt, href: s.url, citation: s.citedInSummary ? (s.citation ?? 0) : null }))} /></div>',
  },
  {
    group: 'Editorial',
    name: 'Developing band',
    code: '<div className="bg-band p-8 text-band-text"><div className="grid gap-8 lg:grid-cols-3">{fixtureDeveloping.map((n, i) => <NarrativeColumn key={n.id} narrative={n} position={i} />)}</div></div>',
  },
  {
    group: 'Editorial',
    name: 'SourceList',
    code: '<div className="max-w-reading"><SourceList sources={fixtureLead.sources} /></div>',
  },
  {
    group: 'Editorial',
    name: 'NarrativeGraph',
    code: '<div className="max-w-2xl"><NarrativeGraph narrative={fixtureNarrative} currentStoryId="sty_pillay" /></div>',
  },
  {
    group: 'Editorial',
    name: 'CoverageMatrix',
    code: '<CoverageMatrix matrix={fixtureCoverage} />',
  },
  {
    group: 'Editorial',
    name: 'ClaimList',
    code: '<div className="max-w-reading"><ClaimList claims={fixtureLead.claims} /></div>',
  },
  {
    group: 'AssessmentScorecard',
    name: 'Reviewed (public broadcaster, centre)',
    code: '<AssessmentScorecard assessment={fixtureAssessment} />',
  },
  {
    group: 'AssessmentScorecard',
    name: 'State-owned, deprecated, lean not assessed',
    code: '<AssessmentScorecard assessment={fixtureAssessmentUnrated} />',
  },
  {
    group: 'Scale',
    name: 'Status and position',
    code: '<div className="grid max-w-xl gap-8"><StatusScale steps={[{ key: "a", label: "Generally reliable", tone: "success" }, { key: "b", label: "No consensus", tone: "warning" }, { key: "c", label: "Generally unreliable", tone: "error" }, { key: "d", label: "Deprecated", tone: "error" }]} value="b" /><StatusScale steps={[{ key: "a", label: "Generally reliable", tone: "success" }, { key: "b", label: "No consensus", tone: "warning" }]} value={null} /><PositionScale steps={["Left", "Centre-left", "Centre", "Centre-right", "Right"]} value={1} startLabel="Left" endLabel="Right" /><PositionScale steps={["Left", "Centre-left", "Centre", "Centre-right", "Right"]} value={null} startLabel="Left" endLabel="Right" /></div>',
  },
  {
    group: 'LeanSpread',
    name: 'One-sided, with unrated publishers',
    code: '<div className="max-w-sm"><LeanSpread lean={fixtureLead.leanMix[0]} countryLabel="United Kingdom" /></div>',
  },
  {
    group: 'LeanSpread',
    name: 'Too few rated',
    code: '<div className="max-w-sm"><LeanSpread lean={fixtureLead.leanMix[1]} countryLabel="Ireland" /></div>',
  },
  {
    group: 'MixBars',
    name: 'Desk mix vs all outlets',
    code: '<MixBars title="Desks · 64 stories" entries={fixtureCoverageProfile.desks.map((d) => ({ ...d, label: d.key, fillClass: cx(deskKey(d.key), "bg-key") }))} />',
  },
  {
    group: 'Meter',
    name: 'Official-source share',
    code: '<Meter value={fixtureCoverageProfile.officialShare} label="of its stories also carry an official source" />',
  },
]
