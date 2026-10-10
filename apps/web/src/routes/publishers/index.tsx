import { relativeTime } from '@dn/domain'
import { CoverageMatrix, Notice } from '@dn/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { RouterLink } from '../../components/link.tsx'
import { Page, SectionLabel } from '../../components/page.tsx'
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
      <h1 className="font-serif text-2xl font-medium tracking-tight md:text-3xl">Publishers</h1>
      <p className="mt-2 mb-10 max-w-reading text-text-secondary">
        Which outlets reported which stories, and who was first. This shows coverage only; it does
        not rate accuracy or political leaning.
      </p>

      <section aria-labelledby="matrix-heading">
        <SectionLabel>
          <span id="matrix-heading">Who covered what</span>
        </SectionLabel>
        {data.matrix.stories.length === 0 ? (
          <Notice title="No shared stories yet">
            The matrix fills in once several outlets report the same story.
          </Notice>
        ) : (
          <CoverageMatrix matrix={data.matrix} Link={RouterLink} />
        )}
      </section>

      <section aria-labelledby="outlets-heading" className="mt-12">
        <SectionLabel>
          <span id="outlets-heading">Outlets</span>
        </SectionLabel>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-text-muted">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Outlet
                </th>
                <th scope="col" className="py-2 pr-4 font-medium tabular-nums">
                  Stories
                </th>
                <th scope="col" className="py-2 pr-4 font-medium tabular-nums">
                  First to report
                </th>
                <th scope="col" className="py-2 pr-4 font-medium tabular-nums">
                  Only source
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
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
                      className="font-medium text-text hover:underline underline-offset-4"
                    >
                      {p.name}
                    </Link>
                    <span className="ml-2 font-mono text-2xs text-text-muted">
                      {p.countryCode}
                      {p.kind === 'official' ? ' · official' : ''}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 tabular-nums">{p.storiesCovered}</td>
                  <td className="py-2.5 pr-4 tabular-nums">{p.firstReports}</td>
                  <td className="py-2.5 pr-4 tabular-nums">{p.exclusives}</td>
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
