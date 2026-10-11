import { formatDate, plural } from '@dn/domain'
import {
  type CoverageProfile,
  DESK_LABELS,
  type Desk,
  REGION_LABELS,
  type Region,
} from '@dn/schemas'
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

          <dl className="mt-8 grid grid-cols-2 border-t-2 border-rule sm:grid-cols-3">
            {[
              ['Stories', p.storiesCovered],
              ['First to report', p.firstReports],
              ['Articles seen', p.articleCount],
            ].map(([label, value]) => (
              <div key={label} className="border-b border-border py-4 pr-4">
                <dt className="type-label text-text-muted">{label}</dt>
                <dd className="mt-1 type-numeral tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <CoverageProfileSection profile={p.profile} />

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

const pct = (n: number) => `${Math.round(n * 100)}%`

/** Facts about what this outlet covers vs all published Stories; no ratings. */
function CoverageProfileSection({ profile }: { profile: CoverageProfile }) {
  if (profile.storyCount === 0) return null
  return (
    <section aria-labelledby="profile-heading" className="mt-12">
      <SectionLabel id="profile-heading">Coverage, last {profile.days} days</SectionLabel>
      <div className="grid gap-10 md:grid-cols-2">
        <MixBars
          title="Desks"
          entries={profile.desks.slice(0, 6)}
          label={(k) => DESK_LABELS[k as Desk] ?? k}
        />
        <MixBars
          title="Regions"
          entries={profile.regions.slice(0, 6)}
          label={(k) => REGION_LABELS[k as Region] ?? k}
        />
      </div>
      <p className="mt-6 max-w-reading text-sm text-text-secondary">
        Bars show the share of this outlet's {plural(profile.storyCount, 'story', 'stories')}; the
        tick marks the share across all outlets.
        {profile.officialShare !== null
          ? ` ${pct(profile.officialShare)} of its stories also carry an official source.`
          : ''}
      </p>
      {profile.missedMajor.count > 0 ? (
        <div className="mt-6">
          <p className="type-label text-text-muted">
            Not covered:{' '}
            {plural(profile.missedMajor.count, 'widely reported story', 'widely reported stories')}{' '}
            this week
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {profile.missedMajor.examples.map((s) => (
              <li key={s.id}>
                <Link
                  to="/stories/$slug"
                  params={{ slug: s.slug }}
                  className="link-headline font-semibold"
                >
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function MixBars({
  title,
  entries,
  label,
}: {
  title: string
  entries: CoverageProfile['desks']
  label: (key: string) => string
}) {
  return (
    <div>
      <p className="mb-3 type-label text-text-muted">{title}</p>
      <ul className="flex flex-col gap-2.5">
        {entries.map((e) => (
          <li key={e.key} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-sm">
            <span className="truncate">{label(e.key)}</span>
            <span className="relative h-2.5 bg-border" aria-hidden>
              <span className="absolute inset-y-0 left-0 bg-text" style={{ width: pct(e.share) }} />
              <span
                className="absolute -inset-y-1 w-0.5 bg-accent"
                style={{ left: pct(e.overallShare) }}
              />
            </span>
            <span className="text-right tabular-nums">
              {pct(e.share)}
              <span className="sr-only">, all outlets {pct(e.overallShare)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
