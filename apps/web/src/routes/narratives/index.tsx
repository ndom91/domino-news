import { relativeTime } from '@dn/domain'
import { Notice } from '@dn/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Page } from '../../components/page.tsx'
import { queries } from '../../lib/api.ts'

export const Route = createFileRoute('/narratives/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(queries.narratives()),
  head: () => ({ meta: [{ title: 'Narratives · Domino News' }] }),
  component: NarrativesPage,
})

function NarrativesPage() {
  const { data } = useSuspenseQuery(queries.narratives())
  return (
    <Page className="max-w-3xl!">
      <h1 className="font-serif text-2xl font-medium tracking-tight md:text-3xl">Narratives</h1>
      <p className="mt-2 mb-8 max-w-reading text-text-secondary">
        Connected stories followed over time: what happened first, what followed, and where it
        branched.
      </p>
      {data.items.length === 0 ? (
        <Notice title="No narratives yet">
          Narratives form once related stories are linked by the pipeline.
        </Notice>
      ) : (
        <ol className="flex flex-col divide-y divide-border border-t border-rule">
          {data.items.map((n) => (
            <li key={n.id} className="py-5">
              <Link
                to="/narratives/$slug"
                params={{ slug: n.slug }}
                className="font-serif text-xl leading-snug hover:underline underline-offset-4"
              >
                {n.title}
              </Link>
              {n.description ? <p className="mt-1 text-text-secondary">{n.description}</p> : null}
              <p className="mt-2 font-mono text-xs text-text-muted">
                {n.storyCount} stories · updated {relativeTime(n.updatedAt)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Page>
  )
}
