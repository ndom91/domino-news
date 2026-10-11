import { plural } from '@dn/domain'
import { DESK_LABELS, type Desk, type Insights, REGION_LABELS, type Region } from '@dn/schemas'
import { Notice, PeriodBar, Skeleton, StoryItem } from '@dn/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { RouterLink } from '../components/link.tsx'
import { Page, PageTitle } from '../components/page.tsx'
import { ReadingHistoryToggle } from '../components/reading-history.tsx'
import { queries } from '../lib/api.ts'

export const Route = createFileRoute('/blindspot')({
  head: () => ({ meta: [{ title: 'Blindspot · Domino News' }] }),
  component: BlindspotPage,
})

// Per user and client-only, like the edition preference on the front page.
function BlindspotPage() {
  const insights = useQuery(queries.insights())
  return (
    <Page>
      <PageTitle
        meta={
          insights.data?.enabled
            ? plural(insights.data.readCount, 'story read', 'stories read')
            : undefined
        }
      >
        Blindspot
      </PageTitle>
      {insights.isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : insights.isError ? (
        <Notice tone="error" title="Blindspot could not be loaded">
          {insights.error.message}
        </Notice>
      ) : !insights.data.enabled ? (
        <section className="max-w-reading">
          <p className="mb-6 text-md text-text-secondary">
            What you missed in stories you follow, and which parts of the world and which desks you
            rarely read. Built only from the stories you open, never from guesses about your
            politics.
          </p>
          <ReadingHistoryToggle />
        </section>
      ) : (
        <InsightSections data={insights.data} />
      )}
    </Page>
  )
}

function InsightSections({ data }: { data: Insights }) {
  const now = new Date().toISOString()
  if (data.missedDevelopments.length === 0 && data.gaps.length === 0) {
    return (
      <p className="max-w-reading text-text-secondary">
        Nothing to show yet. Open a few stories, and this page fills in with new developments in
        what you follow and regions or desks you rarely read.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-12">
      {data.missedDevelopments.length > 0 ? (
        <section aria-labelledby="missed-heading" className="flex flex-col gap-8">
          <PeriodBar id="missed-heading" title="Since you last read" />
          {data.missedDevelopments.map((m) => (
            <div key={m.narrative.id}>
              <Link
                to="/narratives/$slug"
                params={{ slug: m.narrative.slug }}
                className="type-narrative-title link-headline"
              >
                {m.narrative.title}
              </Link>
              <p className="mt-1 mb-5 type-meta">
                {plural(m.stories.length, 'new development')} since you last read this narrative
              </p>
              <div className="grid grid-cols-3 gap-x-grid gap-y-10 max-lg:grid-cols-2 max-md:grid-cols-1">
                {m.stories.map((story) => (
                  <StoryItem key={story.id} story={story} now={now} Link={RouterLink} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {data.gaps.length > 0 ? (
        <section aria-labelledby="gaps-heading" className="flex flex-col gap-6">
          <PeriodBar id="gaps-heading" title="You rarely read" />
          <ul className="grid gap-6 md:grid-cols-3">
            {data.gaps.map((g) => (
              <li key={`${g.kind}-${g.key}`} className="border-t-2 border-rule pt-3">
                <p className="type-headline">{gapLabel(g)}</p>
                <p className="mt-1 text-text-secondary">
                  {plural(g.storiesThisWeek, 'story', 'stories')} this week ·{' '}
                  {g.yourReads === 0 ? 'none read by you' : `${g.yourReads} read by you`}
                </p>
                {g.kind === 'region' ? (
                  <Link
                    to="/"
                    search={{ region: g.key as Region }}
                    className="mt-2 inline-block link-inline text-sm font-bold"
                  >
                    See {REGION_LABELS[g.key as Region]} stories
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="max-w-reading type-meta">
        Based on stories you opened in the last 30 days. Manage reading history on your{' '}
        <Link to="/account" className="underline underline-offset-4">
          account page
        </Link>
        .
      </p>
    </div>
  )
}

function gapLabel(g: Insights['gaps'][number]) {
  return g.kind === 'region' ? REGION_LABELS[g.key as Region] : DESK_LABELS[g.key as Desk]
}
