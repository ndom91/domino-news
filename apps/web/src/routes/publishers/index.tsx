import { plural, pluralWord, regionForCountry } from '@dn/domain'
import {
  LEAN_LABELS,
  type PublisherStats,
  publisherLeanSchema,
  REGION_LABELS,
  REGIONS,
  type Region,
} from '@dn/schemas'
import { LeanMark, PublisherLogo, positionKey, Select, TextInput, Timestamp } from '@dn/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod/mini'
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

// Case- and accent-insensitive, so "agencia" finds Agência Brasil.
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
const matchesQuery = (p: PublisherStats, q: string) =>
  !q || fold(`${p.name} ${p.domain}`).includes(fold(q))

export const Route = createFileRoute('/publishers/')({
  validateSearch: z.object({
    q: z.catch(z.optional(z.string()), undefined),
    lean: z.catch(z.optional(leanFilterSchema), undefined),
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(queries.publishers()),
  head: () => ({ meta: [{ title: 'Publishers · Domino Wire' }] }),
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
  const { q = '', lean } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  // The field keeps its own text so typing never waits on the router; it follows the URL on
  // back and forward. (Keying it on the URL, like the select, would drop focus per keystroke.)
  const [query, setQuery] = useState(q)
  // What this field last wrote to the URL: the URL catching up with typing isn't a change to
  // copy back (it could be a keystroke behind).
  const written = useRef(q)
  useEffect(() => {
    if (q !== written.current) setQuery(q)
  }, [q])
  const shown = data.items.filter((p) => matchesQuery(p, query.trim()) && matchesLean(p, lean))
  const filtered = Boolean(query.trim() || lean)
  return (
    <Page>
      <PageTitle meta={plural(data.items.length, 'publisher')}>Publishers</PageTitle>
      <p className="-mt-4 mb-10 max-w-reading text-text-secondary">
        Every publisher Domino follows. Open one to see what it covers, who it reports alongside,
        and its reviewed assessment of funding, reliability and political lean.
      </p>

      <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-2">
        <TextInput
          type="search"
          name="q"
          label="Search publishers"
          hideLabel
          placeholder="Search publishers…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            written.current = event.target.value
            navigate({
              search: (prev) => ({ ...prev, q: event.target.value || undefined }),
              replace: true,
              resetScroll: false,
            })
          }}
          className="w-72 max-sm:w-full"
        />
        <Select
          // Keyed on the URL so back and forward reset the field.
          key={lean ?? 'any'}
          aria-label="Filter by political lean"
          // Same height as the search field beside it.
          className="min-h-tap"
          name="lean"
          options={LEAN_FILTER_OPTIONS}
          value={lean ?? null}
          onValueChange={(next) =>
            navigate({
              search: (prev) => ({ ...prev, lean: next ?? undefined }),
              replace: true,
              resetScroll: false,
            })
          }
        />
        <p className="type-meta" aria-live="polite">
          {filtered ? `${plural(shown.length, 'publisher')} shown` : null}
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
            p.lean ? (
              <span className="mt-1.5 flex items-center gap-2 type-meta">
                <LeanMark lean={p.lean} />
                <span>
                  {LEAN_LABELS[p.lean]}
                  {/* The country code already sits top right; only name a different one. */}
                  {p.leanCountry && p.leanCountry !== p.countryCode ? ` (${p.leanCountry})` : ''}
                  {p.leanBasis === 'estimated' ? ' · estimated' : ''}
                </span>
              </span>
            ) : (
              <span className="mt-1 type-meta">Lean not assessed</span>
            )
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
