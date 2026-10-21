import type { BriefingResponse, ForYouReason } from '@dn/schemas'
import { Notice, StoryItem, StoryItemSkeleton } from '@dn/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { RouterLink } from '../components/link.tsx'
import { Page } from '../components/page.tsx'
import { queries } from '../lib/api.ts'

export const Route = createFileRoute('/briefing')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(queries.briefing())
    return { now: new Date().toISOString() }
  },
  pendingComponent: BriefingSkeleton,
  head: () => ({ meta: [{ title: 'Briefing · Domino Wire' }] }),
  component: BriefingPage,
})

function BriefingPage() {
  const { now } = Route.useLoaderData()
  const { data: briefing } = useSuspenseQuery(queries.briefing())
  return (
    <Page>
      <header className="grid pb-2 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.32fr)] md:items-end md:gap-x-column">
        <div>
          <p className="mb-3 type-label text-accent-text">Your news desk</p>
          <h1 className="type-display-md text-[clamp(2.5rem,4vw,4rem)]">Briefing</h1>
        </div>
        <p className="mt-6 border-l-2 border-rule pl-4 text-base leading-snug text-text-secondary md:mt-0">
          {briefing.since
            ? 'What changed since your last briefing.'
            : 'Your first briefing: a considered view of the news now.'}
        </p>
      </header>
      {!briefing.personalised ? (
        <Notice tone="neutral" title="Make this briefing yours" className="mt-8 max-w-reading">
          Pick the regions, desks and topics you care about, or follow a narrative or publisher.
          Important stories still appear even without picks.
          <Link
            to="/account"
            search={{ tab: 'preferences' }}
            className="ml-1 link-inline font-semibold"
          >
            Set your preferences
          </Link>
        </Notice>
      ) : null}
      {briefing.sections.length ? (
        <div className="flex flex-col gap-16 pt-10 pb-16 md:gap-20">
          {briefing.sections.map((section) => (
            <BriefingSection key={section.kind} section={section} now={now} />
          ))}
        </div>
      ) : (
        <p className="text-text-secondary">No stories in the last three days yet.</p>
      )}
    </Page>
  )
}

function BriefingSection({
  section,
  now,
}: {
  section: BriefingResponse['sections'][number]
  now: string
}) {
  return (
    <section aria-labelledby={`briefing-${section.kind}`}>
      <div className="border-t-2 border-rule pt-4">
        <h2 id={`briefing-${section.kind}`} className="type-period">
          {section.title}
        </h2>
        <p className="mt-2 max-w-reading text-base leading-snug text-text-secondary">
          {section.description}
        </p>
      </div>
      <div className="mt-8 grid grid-cols-3 gap-x-column gap-y-12 max-lg:grid-cols-2 max-md:grid-cols-1">
        {section.items.map((item) => (
          <article key={item.story.id} className="flex flex-col">
            <StoryItem story={item.story} now={now} Link={RouterLink} showFirstReport={false} />
            {item.update ? (
              <p className="mt-3 text-sm font-semibold leading-snug text-text-secondary">
                {item.update.description}
              </p>
            ) : null}
            <p className="mt-2 type-meta text-text-muted">{reasonText(item.reasons)}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function reasonText(reasons: ForYouReason[]) {
  const reason = reasons[0]
  if (!reason) return 'Included to keep your briefing broad.'
  switch (reason.kind) {
    case 'narrative':
      return `You follow ${reason.label}.`
    case 'publisher':
      return `From ${reason.label}, which you follow.`
    case 'topic':
      return `Topic you picked: ${reason.label}.`
    case 'region':
      return `Region you picked: ${reason.label}.`
    case 'desk':
      return `Desk you picked: ${reason.label}.`
    case 'learned':
      return `You asked for more ${reason.label}.`
  }
}

function BriefingSkeleton() {
  return (
    <Page>
      <h1 className="sr-only">Briefing</h1>
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading briefing"
        className="grid grid-cols-3 gap-x-column gap-y-12 max-lg:grid-cols-2 max-md:grid-cols-1"
      >
        <StoryItemSkeleton />
        <StoryItemSkeleton />
        <StoryItemSkeleton />
      </div>
    </Page>
  )
}
