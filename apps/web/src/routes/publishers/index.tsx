import { plural, pluralWord, regionForCountry, relativeTime } from '@dn/domain'
import {
  LEAN_LABELS,
  type PublisherStats,
  publisherLeanSchema,
  REGION_LABELS,
  REGIONS,
  type Region,
} from '@dn/schemas'
import {
  CoverageMatrix,
  Notice,
  PublisherLogo,
  positionKey,
  SectionLabel,
  Select,
  Timestamp,
} from '@dn/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { z } from 'zod/mini'
import { RouterLink } from '../../components/link.tsx'
import { Page, PageTitle } from '../../components/page.tsx'
import { queries } from '../../lib/api.ts'

const leanFilterSchema = z.union([publisherLeanSchema, z.literal('not_assessed')])
type LeanFilter = z.infer<typeof leanFilterSchema>

const LEAN_FILTER_OPTIONS = [
  { value: null, label: 'Any lean' },
  ...publisherLeanSchema.options.map((l) => ({ value: l, label: LEAN_LABELS[l] })),
  { value: 'not_assessed' as const, label: 'Not assessed' },
]

const matchesLean = (p: PublisherStats, lean: LeanFilter | undefined) =>
  !lean || (lean === 'not_assessed' ? p.lean === null : p.lean === lean)

export const Route = createFileRoute('/publishers/')({
  validateSearch: z.object({ lean: z.catch(z.optional(leanFilterSchema), undefined) }),
  loader: ({ context }) => context.queryClient.ensureQueryData(queries.publishers()),
  head: () => ({ meta: [{ title: 'Publishers · Domino News' }] }),
  component: PublishersPage,
})

/** Groups in REGIONS order, keeping the API's order (most stories first) inside each. */
function byRegion(items: PublisherStats[]) {
  const groups = new Map<Region, PublisherStats[]>()
  for (const p of items) {
    // Publishers without a country (UN, EU bodies) are "International".
    const region = regionForCountry(p.countryCode) ?? 'global'
    groups.set(region, [...(groups.get(region) ?? []), p])
  }
  return REGIONS.filter((r) => groups.has(r))
    .map((region) => ({
      region,
      label: region === 'global' ? 'International' : REGION_LABELS[region],
      items: groups.get(region) ?? [],
    }))
    .sort((a, b) => Number(a.region === 'global') - Number(b.region === 'global'))
}

function PublishersPage() {
  const { data } = useSuspenseQuery(queries.publishers())
  const isAdmin = Route.useRouteContext().session.user?.isAdmin ?? false
  const { lean } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const shown = data.items.filter((p) => matchesLean(p, lean))
  return (
    <Page>
      <PageTitle meta={plural(data.items.length, 'publisher')}>Publishers</PageTitle>
      <p className="-mt-4 mb-10 max-w-reading text-text-secondary">
        Every publisher Domino follows. Open one to see what it covers, who it reports alongside,
        and its reviewed assessment of funding, reliability and political lean.
      </p>

      <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Select
          // Keyed on the URL so back and forward reset the field.
          key={lean ?? 'any'}
          aria-label="Filter by political lean"
          name="lean"
          options={LEAN_FILTER_OPTIONS}
          value={lean ?? null}
          onValueChange={(next) =>
            navigate({ search: { lean: next ?? undefined }, replace: true, resetScroll: false })
          }
        />
        <p className="type-meta" aria-live="polite">
          {lean ? `${plural(shown.length, 'publisher')} shown` : null}
        </p>
      </div>

      <div className="flex flex-col gap-12">
        {shown.length === 0 ? (
          <p className="text-text-secondary">
            No publishers match.{' '}
            <Link to="/publishers" search={{}} className="underline underline-offset-4">
              Show all publishers
            </Link>
            .
          </p>
        ) : null}
        {byRegion(shown).map((group, i) => (
          <section
            key={group.region}
            aria-labelledby={`region-${group.region}`}
            className={positionKey(i)}
          >
            <h2 id={`region-${group.region}`} className="mb-4 flex items-baseline gap-3 type-label">
              {group.label}
              <span className="type-meta tracking-normal normal-case">
                {plural(group.items.length, 'publisher')}
              </span>
            </h2>
            <ul className="grid grid-cols-4 gap-x-column gap-y-8 max-lg:grid-cols-2 max-sm:grid-cols-1">
              {group.items.map((p) => (
                <li key={p.id}>
                  <PublisherCard publisher={p} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section aria-labelledby="matrix-heading" className="mt-16">
        <SectionLabel id="matrix-heading">Who covered what</SectionLabel>
        {data.matrix.stories.length === 0 ? (
          <Notice title="No shared stories yet">
            The matrix fills in once several publishers report the same story.
          </Notice>
        ) : (
          <CoverageMatrix matrix={data.matrix} Link={RouterLink} />
        )}
      </section>

      {isAdmin ? (
        <section aria-labelledby="outlets-heading" className="mt-12">
          <SectionLabel id="outlets-heading">Publisher stats</SectionLabel>
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
      ) : null}
    </Page>
  )
}

/** The whole card links to the publisher's page. */
function PublisherCard({ publisher: p }: { publisher: PublisherStats }) {
  return (
    <Link
      to="/publishers/$slug"
      params={{ slug: p.slug }}
      className="group flex h-full flex-col border-t-4 border-key pt-3"
    >
      <span className="flex items-start gap-3">
        <PublisherLogo slug={p.slug} size={52} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-md font-bold leading-snug group-hover:underline underline-offset-4">
              {p.name}
            </span>
            {p.countryCode ? <span className="flex-none type-meta">{p.countryCode}</span> : null}
          </span>
          <span className="truncate type-meta">
            {p.domain}
            {p.kind === 'official' ? ' · Official source' : ''}
          </span>
          {p.kind === 'newsroom' ? (
            <span className="mt-1 type-meta">
              {p.lean
                ? `${LEAN_LABELS[p.lean]}${p.leanCountry ? ` (${p.leanCountry})` : ''}${p.leanBasis === 'estimated' ? ' · estimated' : ''}`
                : 'Lean not assessed'}
            </span>
          ) : null}
        </span>
      </span>
      <span className="mt-4 grid grid-cols-2 gap-3">
        <span>
          <span className="block type-numeral">{p.storiesCovered}</span>
          <span className="type-meta">{pluralWord(p.storiesCovered, 'story', 'stories')}</span>
        </span>
        <span>
          <span className="block type-numeral">{p.firstReports}</span>
          <span className="type-meta">first to report</span>
        </span>
      </span>
      <span className="mt-auto pt-3 type-meta">
        {p.lastSeenAt ? <Timestamp at={p.lastSeenAt} prefix="Last report" /> : 'No reports yet'}
      </span>
    </Link>
  )
}
