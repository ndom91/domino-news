import { plural, relativeTime } from '@dn/domain'
import {
  DESK_LABELS,
  type Desk,
  REGION_LABELS,
  type Region,
  regionSchema,
  searchQuerySchema,
} from '@dn/schemas'
import { Badge, Button, cx, deskKey, Notice, Reveal, Select, Skeleton, TextInput } from '@dn/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useId } from 'react'
import { z } from 'zod/mini'
import { Page, PageTitle } from '../components/page.tsx'
import { queries } from '../lib/api.ts'
import { regionOptions } from '../lib/regions.ts'

// Same filters as the API; the page also allows an empty query (no search yet).
const searchParams = z.extend(searchQuerySchema, { q: z._default(z.optional(z.string()), '') })

export const Route = createFileRoute('/search')({
  validateSearch: searchParams,
  // Load outlets up front so a deep-linked ?publisher= shows as selected. Prefetch never
  // throws, so search still works if the outlet list fails.
  loader: ({ context }) => context.queryClient.prefetchQuery(queries.publishers()),
  head: () => ({ meta: [{ title: 'Search · Domino News' }] }),
  component: SearchPage,
})

const SINCE_OPTIONS = [
  { value: 'all', label: 'Any time' },
  { value: '24h', label: 'Past day' },
  { value: '7d', label: 'Past week' },
  { value: '30d', label: 'Past month' },
] as const

const REGION_OPTIONS = regionOptions('Any region')

function SearchPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/search' })
  const results = useQuery(queries.search(search))
  const publishers = useQuery(queries.publishers())
  const sinceId = useId()
  const pubId = useId()
  const regionId = useId()

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    navigate({
      search: {
        q: String(form.get('q') ?? '').trim(),
        type: search.type,
        since: (form.get('since') as typeof search.since) ?? 'all',
        publisher: String(form.get('publisher') ?? '') || undefined,
        region: regionSchema.safeParse(form.get('region')).data,
      },
    })
  }

  return (
    <Page>
      <PageTitle>Search</PageTitle>
      <search className="block max-w-4xl">
        {/* Keyed on the URL so back/forward remounts the fields with the current filters. */}
        <form key={JSON.stringify(search)} onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <TextInput
              label="Search stories and narratives"
              hideLabel
              name="q"
              type="search"
              defaultValue={search.q}
              placeholder="Search stories and narratives"
              className="flex-1"
              // Only on an empty search: on mobile it would pop the keyboard over the results.
              autoFocus={!search.q}
            />
            <Button type="submit" variant="primary">
              Search
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label htmlFor={sinceId} className="type-label">
              Updated
            </label>
            <Select id={sinceId} name="since" options={SINCE_OPTIONS} defaultValue={search.since} />
            <label htmlFor={pubId} className="type-label">
              Publisher
            </label>
            <Select
              id={pubId}
              name="publisher"
              options={[
                { value: null, label: 'Any publisher' },
                ...(publishers.data?.items.map((p) => ({ value: p.slug, label: p.name })) ?? []),
              ]}
              defaultValue={search.publisher ?? null}
            />
            <label htmlFor={regionId} className="type-label">
              Region
            </label>
            <Select
              id={regionId}
              name="region"
              options={REGION_OPTIONS}
              defaultValue={search.region ?? null}
            />
          </div>
        </form>
      </search>

      <div className="mt-10 max-w-4xl" aria-live="polite">
        {!search.q ? (
          <p className="text-text-muted">Search by topic, person, place or publisher.</p>
        ) : results.isPending ? (
          <div className="flex flex-col gap-4" aria-busy="true">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : results.isError ? (
          <Notice
            tone="error"
            title="Search is unavailable right now"
            action={
              <Button size="sm" onClick={() => results.refetch()}>
                Try again
              </Button>
            }
          >
            {results.error.message}
          </Notice>
        ) : results.data.hits.length === 0 ? (
          <Notice title={`No results for “${search.q}”`}>
            Try fewer words, or widen the time range.
          </Notice>
        ) : (
          <Reveal>
            <p className="mb-4 type-meta">
              {plural(results.data.hits.length, 'result')} ·{' '}
              {results.data.mode === 'hybrid'
                ? 'keyword and meaning'
                : 'exact words only right now'}
            </p>
            <ol className="flex flex-col divide-y divide-border border-t-2 border-rule">
              {results.data.hits.map((hit) => (
                <li key={`${hit.type}-${hit.id}`} className="py-5">
                  {hit.type === 'narrative' ? (
                    <>
                      <Badge tone="ink">Narrative</Badge>
                      <Link
                        to="/narratives/$slug"
                        params={{ slug: hit.slug }}
                        className="mt-2 block type-headline link-headline"
                      >
                        {hit.title}
                      </Link>
                      {hit.description ? (
                        <p className="mt-1.5 text-text-secondary">{hit.description}</p>
                      ) : null}
                      <p className="mt-2 type-meta">{plural(hit.storyCount, 'story', 'stories')}</p>
                    </>
                  ) : (
                    <>
                      <StoryTags desk={hit.desk} regions={hit.regions} />
                      <Link
                        to="/stories/$slug"
                        params={{ slug: hit.slug }}
                        className="type-headline link-headline"
                      >
                        {hit.title}
                      </Link>
                      {hit.summary ? (
                        <p className="mt-1.5 line-clamp-2 text-text-secondary">{hit.summary}</p>
                      ) : null}
                      <p className="mt-2 type-meta">
                        {hit.publisherNames.slice(0, 3).join(', ')}
                        {hit.publisherNames.length > 3 ? ` +${hit.publisherNames.length - 3}` : ''}{' '}
                        · updated {relativeTime(hit.lastUpdatedAt)}
                      </p>
                    </>
                  )}
                </li>
              ))}
            </ol>
          </Reveal>
        )}
      </div>
    </Page>
  )
}

/** Desk chip in its desk colour (as on story bars), then muted region chips. */
function StoryTags({ desk, regions }: { desk: Desk | null; regions: Region[] }) {
  if (!desk && regions.length === 0) return null
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-bold">
      {desk ? (
        <span className={cx(deskKey(desk), 'key-fill px-1.5 py-0.5')}>{DESK_LABELS[desk]}</span>
      ) : null}
      {regions.map((r) => (
        <span key={r} className="border border-border-strong px-1.5 py-0.5 text-text-secondary">
          {REGION_LABELS[r]}
        </span>
      ))}
    </div>
  )
}
