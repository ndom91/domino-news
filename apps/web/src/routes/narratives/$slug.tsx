import { formatDate } from '@dn/domain'
import { NarrativeGraph } from '@dn/ui'
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
    <Page className="max-w-3xl!">
      <p className="text-xs font-medium uppercase tracking-label text-text-muted">Narrative</p>
      <h1 className="mt-2 font-serif text-2xl font-medium leading-tight tracking-tight text-balance md:text-3xl">
        {narrative.title}
      </h1>
      {narrative.description ? (
        <p className="mt-3 max-w-reading text-md leading-reading text-text-secondary">
          {narrative.description}
        </p>
      ) : null}
      <p className="mt-4 mb-10 font-mono text-xs text-text-muted">
        {narrative.stories.length} developments
        {first && last
          ? ` · ${formatDate(first.firstObservedAt)} to ${formatDate(last.firstObservedAt)}`
          : ''}
      </p>
      <NarrativeGraph narrative={narrative} Link={RouterLink} />
      <p className="mt-8 max-w-reading text-xs text-text-muted">
        Links between stories are proposed by a language model from the stories' summaries and
        checked for consistent ordering. Lane colours only separate branches.
      </p>
    </Page>
  )
}
