import { plural, relativeTime } from '@dn/domain'
import { CoverageMatrix, Notice, SectionLabel } from '@dn/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { RouterLink } from '../../components/link.tsx'
import { Page, PageTitle } from '../../components/page.tsx'
import { queries } from '../../lib/api.ts'

export const Route = createFileRoute('/publishers/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(queries.publishers()),
  head: () => ({ meta: [{ title: 'Publishers · Domino News' }] }),
  component: PublishersPage,
})

function PublishersPage() {
  const { data } = useSuspenseQuery(queries.publishers())
  return (
    <Page>
      <PageTitle meta={plural(data.items.length, 'publisher')}>Publishers</PageTitle>
      <p className="-mt-4 mb-10 max-w-reading text-text-secondary">
        Which publishers reported which stories, and who was first. This shows coverage only; it
        does not rate accuracy or political leaning.
      </p>

      <section aria-labelledby="matrix-heading">
        <SectionLabel id="matrix-heading">Who covered what</SectionLabel>
        {data.matrix.stories.length === 0 ? (
          <Notice title="No shared stories yet">
            The matrix fills in once several publishers report the same story.
          </Notice>
        ) : (
          <CoverageMatrix matrix={data.matrix} Link={RouterLink} />
        )}
      </section>

      <section aria-labelledby="outlets-heading" className="mt-12">
        <SectionLabel id="outlets-heading">All publishers</SectionLabel>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-rule text-left type-label">
                <th scope="col" className="py-2 pr-4">
                  Publisher
                </th>
                <th scope="col" className="py-2 pr-4">
                  Stories
                </th>
                <th scope="col" className="py-2 pr-4">
                  First to report
                </th>
                <th scope="col" className="py-2 pr-4">
                  Last seen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.items.map((p) => (
                <tr key={p.id}>
                  <td className="py-2.5 pr-4">
                    <Link
                      to="/publishers/$slug"
                      params={{ slug: p.slug }}
                      className="font-semibold text-text hover:underline underline-offset-4"
                    >
                      {p.name}
                    </Link>
                    <span className="ml-2 type-meta">
                      {p.countryCode}
                      {p.kind === 'official' ? ' · official' : ''}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4">{p.storiesCovered}</td>
                  <td className="py-2.5 pr-4">{p.firstReports}</td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-text-muted">
                    {p.lastSeenAt ? relativeTime(p.lastSeenAt) : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Page>
  )
}
