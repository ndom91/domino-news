import { formatDate, plural } from '@dn/domain'
import { cx, deskKey, NarrativeActivity, NarrativeGraph, SectionLabel } from '@dn/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { FollowButton } from '../../components/follow-button.tsx'
import { RouterLink } from '../../components/link.tsx'
import { Page } from '../../components/page.tsx'
import { queries } from '../../lib/api.ts'

export const Route = createFileRoute('/narratives/$slug')({
  loader: async ({ context, params }) => {
    const n = await context.queryClient.ensureQueryData(queries.narrative(params.slug))
    return { title: n.title }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.title} · Domino News` : 'Narrative' }],
  }),
  component: NarrativePage,
})

function NarrativePage() {
  const { slug } = Route.useParams()
  const { data: narrative } = useSuspenseQuery(queries.narrative(slug))
  const first = narrative.stories[0]
  const last = narrative.stories[narrative.stories.length - 1]
  return (
    <Page>
      {/* Header, then the chart (beside it on desktop, under it on mobile), then the timeline. */}
      <div className="grid gap-x-14 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="max-w-4xl">
          <header className={cx(deskKey(narrative.desk), 'border-t-6 border-key pt-4')}>
            <p className="type-label text-text-muted">Narrative</p>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
              <h1 className="type-headline-lg text-balance">{narrative.title}</h1>
              <FollowButton targetType="narrative" targetId={narrative.id} name={narrative.title} />
            </div>
          </header>
          {narrative.description ? (
            <p className="mt-3 max-w-reading text-md leading-normal text-text-secondary">
              {narrative.description}
            </p>
          ) : null}
          <p className="mt-4 mb-10 type-meta">
            {plural(narrative.stories.length, 'story', 'stories')}
            {first && last
              ? ` · ${formatDate(first.firstObservedAt)} to ${formatDate(last.firstObservedAt)}`
              : ''}
          </p>
        </div>
        <aside
          aria-labelledby="activity-heading"
          className={cx(deskKey(narrative.desk), 'mb-10 lg:row-span-2 lg:mb-0')}
        >
          <SectionLabel id="activity-heading">Stories per day</SectionLabel>
          <NarrativeActivity times={narrative.stories.map((s) => s.firstObservedAt)} />
        </aside>
        <div className="max-w-4xl">
          <div className="border-t-2 border-rule">
            <NarrativeGraph narrative={narrative} Link={RouterLink} />
          </div>
          <p className="mt-8 max-w-reading text-xs text-text-muted">
            Links between stories are proposed by a language model from the stories' summaries and
            checked for consistent ordering.
          </p>
        </div>
      </div>
    </Page>
  )
}
