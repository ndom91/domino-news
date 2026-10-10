import { formatDate } from '@dn/domain'
import { Badge, Notice, StoryRow } from '@dn/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { RouterLink } from '../../components/link.tsx'
import { Page, SectionLabel } from '../../components/page.tsx'
import { queries } from '../../lib/api.ts'

export const Route = createFileRoute('/publishers/$slug')({
  loader: async ({ context, params }) => {
    const p = await context.queryClient.ensureQueryData(queries.publisher(params.slug))
    return { name: p.name }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.name} · Domino News` : 'Publisher' }],
  }),
  component: PublisherPage,
})

function PublisherPage() {
  const { slug } = Route.useParams()
  const { data: p } = useSuspenseQuery(queries.publisher(slug))
  const maxShared = Math.max(1, ...p.coCoverage.map((c) => c.sharedStories))
  return (
    <Page>
      <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-label text-text-muted">Publisher</p>
          <h1 className="mt-2 font-serif text-2xl font-medium tracking-tight md:text-3xl">
            {p.name}
          </h1>
          <p className="mt-2 font-mono text-xs text-text-muted">
            <a
              href={`https://${p.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-text"
            >
              {p.domain} ↗
            </a>
            {p.countryCode ? ` · ${p.countryCode}` : ''}
            {p.languages.length ? ` · ${p.languages.join(', ')}` : ''}
          </p>

          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
            {[
              ['Stories', p.storiesCovered],
              ['First to report', p.firstReports],
              ['Only source', p.exclusives],
              ['Articles seen', p.articleCount],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface p-4">
                <dt className="text-xs uppercase tracking-label text-text-muted">{label}</dt>
                <dd className="mt-1 font-mono text-2xl tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <section aria-labelledby="recent-heading" className="mt-12">
            <SectionLabel>
              <span id="recent-heading">Recent stories with {p.name}</span>
            </SectionLabel>
            {p.recentStories.length === 0 ? (
              <Notice title="No published stories yet" />
            ) : (
              <ol className="flex flex-col divide-y divide-border">
                {p.recentStories.map((story) => (
                  <li key={story.id} className="py-6 first:pt-2">
                    <StoryRow story={story} Link={RouterLink} />
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-10 lg:pt-16">
          <section aria-labelledby="policy-heading">
            <SectionLabel>
              <span id="policy-heading">Source use</span>
            </SectionLabel>
            <Badge tone={p.bodyPolicy === 'metadata_only' ? 'neutral' : 'accent'}>
              {p.bodyPolicy === 'metadata_only'
                ? 'Headlines and descriptions only'
                : 'Article text processed, not stored'}
            </Badge>
            {p.policyNote ? (
              <p className="mt-3 text-sm leading-normal text-text-secondary">{p.policyNote}</p>
            ) : null}
            {p.policyReviewedAt ? (
              <p className="mt-2 font-mono text-xs text-text-muted">
                Reviewed {formatDate(p.policyReviewedAt)}
              </p>
            ) : null}
          </section>

          <section aria-labelledby="shared-heading">
            <SectionLabel>
              <span id="shared-heading">Often covers the same stories as</span>
            </SectionLabel>
            {p.coCoverage.length === 0 ? (
              <p className="text-sm text-text-muted">No shared stories yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {p.coCoverage.map((c) => (
                  <li key={c.publisher.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <Link
                        to="/publishers/$slug"
                        params={{ slug: c.publisher.slug }}
                        className="hover:underline underline-offset-4"
                      >
                        {c.publisher.name}
                      </Link>
                      <span className="font-mono text-xs text-text-muted tabular-nums">
                        {c.sharedStories}
                      </span>
                    </div>
                    <div aria-hidden className="mt-1 h-1 rounded-full bg-sunken">
                      <div
                        className="h-1 rounded-full bg-viz-neutral"
                        style={{ width: `${(c.sharedStories / maxShared) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </Page>
  )
}
