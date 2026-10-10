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
    code: '<Textarea label="Summary" description="Saving creates a new version. Earlier versions are kept." defaultValue={fixtureStoryDetail.summary.body} />',
  },
  {
    group: 'Card',
    name: 'Plain and sunken',
    code: '<div className="grid gap-4 md:grid-cols-2"><Card>Plain card</Card><Card tone="sunken">Sunken panel</Card></div>',
  },
  {
    group: 'Badge',
    name: 'Tones',
    code: '<div className="flex gap-2"><Badge>Fixture</Badge><Badge tone="accent">Edited</Badge><Badge tone="success">OK</Badge><Badge tone="warning">Paused</Badge><Badge tone="error">Failed</Badge></div>',
  },
  {
    group: 'Popover',
    name: 'Context',
    code: '<Popover title="Navi Pillay" trigger={<button className="underline decoration-dotted">Navi Pillay</button>}>South African jurist; UN High Commissioner for Human Rights 2008–2014.</Popover>',
  },
  {
    group: 'Tooltip',
    name: 'Label',
    code: '<Tooltip content="Exact time: 9 Oct 2026, 09:05 UTC"><button className="font-mono text-xs">2 hours ago</button></Tooltip>',
  },
  {
    group: 'Notice',
    name: 'Empty + error',
    code: '<div className="flex flex-col gap-6"><Notice title="No stories yet">Run the fixture ingest to populate the feed.</Notice><Notice tone="error" title="Could not load stories" action={<Button size="sm">Try again</Button>}>The API returned 503.</Notice></div>',
  },
  {
    group: 'Editorial',
    name: 'SourceTrace compact',
    code: '<SourceTrace sources={fixtureTrace} />',
  },
  {
    group: 'Editorial',
    name: 'SourceTrace full',
    code: '<div className="max-w-xl"><SourceTrace size="full" sources={fixtureTrace} /></div>',
  },
  {
    group: 'Editorial',
    name: 'StoryRow lead',
    code: '<StoryRow lead story={fixtureStory} />',
  },
  {
    group: 'Editorial',
    name: 'StoryRow single source',
    code: '<StoryRow story={fixtureStorySingle} />',
  },
  {
    group: 'Editorial',
    name: 'SummaryBlock',
    code: '<div className="max-w-reading"><SummaryBlock summary={fixtureStoryDetail.summary} sourceCount={4} /></div>',
  },
  {
    group: 'Editorial',
    name: 'SourceList',
    code: '<div className="max-w-reading"><SourceList sources={fixtureStoryDetail.sources} /></div>',
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
    name: 'SummaryBlock with context',
    code: '<div className="max-w-reading"><SummaryBlock summary={fixtureStoryDetail.summary} sourceCount={4} context={fixtureStoryDetail.context} /></div>',
  },
  {
    group: 'Editorial',
    name: 'ClaimList',
    code: '<div className="max-w-reading"><ClaimList claims={fixtureStoryDetail.claims} /></div>',
  },
]
