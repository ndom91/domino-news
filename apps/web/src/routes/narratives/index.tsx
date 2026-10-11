import {
  plural,
  RECENCY_PERIODS,
  type RecencyPeriod,
  recencyPeriod,
  relativeTime,
} from '@dn/domain'
import type { NarrativeListResponse } from '@dn/schemas'
import { cx, deskKey, Notice, PeriodBar } from '@dn/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Page, PageTitle } from '../../components/page.tsx'
import { queries } from '../../lib/api.ts'

export const Route = createFileRoute('/narratives/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(queries.narratives()),
  head: () => ({ meta: [{ title: 'Narratives · Domino News' }] }),
  component: NarrativesPage,
})

const PERIOD_LABELS: Record<RecencyPeriod, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  older: 'Older',
}

type Narrative = NarrativeListResponse['items'][number]

function NarrativesPage() {
  const { data } = useSuspenseQuery(queries.narratives())
  // Day boundaries in UTC, matching the rest of the site; render time is close enough here.
  const now = new Date()
  const groups = RECENCY_PERIODS.map((period) => ({
    period,
    items: data.items.filter((n) => recencyPeriod(n.updatedAt, now) === period),
  })).filter((g) => g.items.length > 0)
  return (
    <Page>
      <PageTitle meta={plural(data.items.length, 'narrative')}>Narratives</PageTitle>
      <p className="-mt-4 mb-10 max-w-reading text-text-secondary">
        Connected stories followed over time: what happened first, what followed, and where it
        branched.
      </p>
      {data.items.length === 0 ? (
        <Notice title="No narratives yet">
          A narrative appears once several related stories are linked together.
        </Notice>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g, i) => (
            // Only the newest period starts open; native <details> collapses without JS.
            <details key={g.period} open={i === 0} className="t-acc">
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <PeriodBar
                  title={
                    <>
                      <span aria-hidden className="t-acc-chevron mr-2">
                        ›
                      </span>
                      {PERIOD_LABELS[g.period]}
                    </>
                  }
                  meta={plural(g.items.length, 'narrative')}
                />
              </summary>
              <NarrativeGrid items={g.items} />
            </details>
          ))}
        </div>
      )}
    </Page>
  )
}

function NarrativeGrid({ items }: { items: Narrative[] }) {
  return (
    <ol className="grid gap-x-8 gap-y-12 pt-8 pb-6 md:grid-cols-2 lg:grid-cols-3">
      {items.map((n) => (
        <li key={n.id} className={cx(deskKey(n.desk), 'border-t-6 border-key pt-4')}>
          <Link
            to="/narratives/$slug"
            params={{ slug: n.slug }}
            className="type-narrative-title link-headline"
          >
            {n.title}
          </Link>
          {n.description ? <p className="mt-2 text-text-secondary">{n.description}</p> : null}
          <p className="mt-2 type-meta">
            {plural(n.storyCount, 'story', 'stories')} · updated {relativeTime(n.updatedAt)}
          </p>
        </li>
      ))}
    </ol>
  )
}
