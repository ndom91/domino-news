import { formatDate } from '@dn/domain'
import { cx, NarrativeGraph, narrativeKey } from '@dn/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
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
      <div className="max-w-4xl">
        <header className={cx(narrativeKey(narrative.colorSlot), 'border-t-6 border-key pt-4')}>
          <p className="type-label text-text-muted">Narrative</p>
          <h1 className="mt-2 type-headline-lg text-balance">{narrative.title}</h1>
        </header>
        {narrative.description ? (
          <p className="mt-3 max-w-reading text-md leading-normal text-text-secondary">
            {narrative.description}
          </p>
        ) : null}
        <p className="mt-4 mb-10 type-meta">
          {narrative.stories.length} developments
          {first && last
            ? ` · ${formatDate(first.firstObservedAt)} to ${formatDate(last.firstObservedAt)}`
            : ''}
        </p>
        <NarrativeGraph narrative={narrative} Link={RouterLink} />
        <p className="mt-8 max-w-reading text-xs text-text-muted">
          Links between stories are proposed by a language model from the stories' summaries and
          checked for consistent ordering. A new lane marks a branch.
        </p>
      </div>
    </Page>
  )
}
