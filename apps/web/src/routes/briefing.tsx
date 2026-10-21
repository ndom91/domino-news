import type { BriefingResponse, ForYouReason } from '@dn/schemas'
import { Notice, SectionHeader, StoryItem, StoryItemSkeleton } from '@dn/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { RouterLink } from '../components/link.tsx'
import { Page, PageTitle } from '../components/page.tsx'
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
      <PageTitle meta={briefing.since ? 'Updated since your last briefing' : 'Your first briefing'}>
        Briefing
      </PageTitle>
      {!briefing.personalised ? (
        <Notice tone="neutral" title="Make this briefing yours" className="mb-10 max-w-reading">
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
        <div className="flex flex-col gap-12 pb-16">
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
      <SectionHeader title={section.title} id={`briefing-${section.kind}`} />
      <p className="-mt-5 mb-7 max-w-reading text-base text-text-secondary">
        {section.description}
      </p>
      <div className="grid grid-cols-3 gap-x-column gap-y-12 max-lg:grid-cols-2 max-md:grid-cols-1">
        {section.items.map((item) => (
          <article key={item.story.id} className="flex flex-col">
            <StoryItem story={item.story} now={now} Link={RouterLink} showFirstReport={false} />
            <p className="mt-3 type-meta text-text-muted">{reasonText(item.reasons)}</p>
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
