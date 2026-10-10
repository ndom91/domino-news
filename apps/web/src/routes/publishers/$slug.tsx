import { formatDate } from '@dn/domain'
import { Badge, Notice, StoryItem } from '@dn/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { RouterLink } from '../../components/link.tsx'
import { Page, SectionLabel } from '../../components/page.tsx'
import { queries } from '../../lib/api.ts'

export const Route = createFileRoute('/publishers/$slug')({
  loader: async ({ context, params }) => {
    const p = await context.queryClient.ensureQueryData(queries.publisher(params.slug))
    return { name: p.name, now: new Date().toISOString() }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.name} · Domino News` : 'Publisher' }],
  }),
  component: PublisherPage,
})

function PublisherPage() {
  const { slug } = Route.useParams()
  const { now } = Route.useLoaderData()
  const { data: p } = useSuspenseQuery(queries.publisher(slug))
  const maxShared = Math.max(1, ...p.coCoverage.map((c) => c.sharedStories))
  return (
    <Page>
      <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <p className="type-label text-text-muted">Publisher</p>
          <h1 className="mt-2 type-headline-lg">{p.name}</h1>
          <p className="mt-2 type-meta">
            <a
              href={`https://${p.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-3 hover:text-text"
            >
              {p.domain} ↗
            </a>
            {p.countryCode ? ` · ${p.countryCode}` : ''}
            {p.kind === 'official' ? ' · Official source' : ''}
            {p.languages.length ? ` · ${p.languages.join(', ')}` : ''}
          </p>

          <dl className="mt-8 grid grid-cols-2 border-t-2 border-rule sm:grid-cols-4">
            {[
              ['Stories', p.storiesCovered],
              ['First to report', p.firstReports],
              ['Only source', p.exclusives],
              ['Articles seen', p.articleCount],
            ].map(([label, value]) => (
              <div key={label} className="border-b border-border py-4 pr-4">
                <dt className="type-label text-text-muted">{label}</dt>
                <dd className="mt-1 type-numeral tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <section aria-labelledby="recent-heading" className="mt-12">
            <SectionLabel id="recent-heading">Recent stories with {p.name}</SectionLabel>
            {p.recentStories.length === 0 ? (
              <Notice title="No published stories yet" />
            ) : (
              <div className="grid gap-x-8 gap-y-11 md:grid-cols-2">
                {p.recentStories.map((story) => (
                  <StoryItem key={story.id} story={story} now={now} Link={RouterLink} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-10 lg:pt-16">
          <section aria-labelledby="policy-heading">
            <SectionLabel id="policy-heading">Source use</SectionLabel>
            <Badge tone={p.bodyPolicy === 'metadata_only' ? 'neutral' : 'ink'}>
              {p.bodyPolicy === 'metadata_only'
                ? 'Headlines and descriptions only'
                : 'Article text processed, not stored'}
            </Badge>
            {p.policyNote ? (
              <p className="mt-3 text-sm leading-normal text-text-secondary">{p.policyNote}</p>
            ) : null}
            {p.license ? <p className="mt-2 type-meta">Licence: {p.license}</p> : null}
            {p.policyReviewedAt ? (
              <p className="mt-2 type-meta">Reviewed {formatDate(p.policyReviewedAt)}</p>
            ) : null}
          </section>

          <section aria-labelledby="shared-heading">
            <SectionLabel id="shared-heading">Often covers the same stories as</SectionLabel>
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
                        className="font-semibold hover:underline underline-offset-4"
                      >
                        {c.publisher.name}
                      </Link>
                      <span className="type-meta tabular-nums">{c.sharedStories}</span>
                    </div>
                    <div aria-hidden className="mt-1 h-1.5 bg-sunken">
                      <div
                        className="h-1.5 bg-text"
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
