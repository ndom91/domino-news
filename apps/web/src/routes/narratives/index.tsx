import { plural, relativeTime } from '@dn/domain'
import { cx, deskKey, Notice } from '@dn/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Page, PageTitle } from '../../components/page.tsx'
import { queries } from '../../lib/api.ts'

export const Route = createFileRoute('/narratives/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(queries.narratives()),
  head: () => ({ meta: [{ title: 'Narratives · Domino News' }] }),
  component: NarrativesPage,
})

function NarrativesPage() {
  const { data } = useSuspenseQuery(queries.narratives())
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
        <ol className="grid gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
          {data.items.map((n) => (
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
      )}
    </Page>
  )
}
