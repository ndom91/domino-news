import { relativeTime } from '@dn/domain'
import { REGION_LABELS, REGIONS, regionSchema, searchQuerySchema } from '@dn/schemas'
import { Badge, Button, Notice, Skeleton, TextInput } from '@dn/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useId } from 'react'
import { z } from 'zod'
import { Page, PageTitle } from '../components/page.tsx'
import { queries } from '../lib/api.ts'

// Same filters as the API; the page also allows an empty query (no search yet).
const searchParams = searchQuerySchema.extend({ q: z.string().optional().default('') })

export const Route = createFileRoute('/search')({
  validateSearch: searchParams,
  head: () => ({ meta: [{ title: 'Search · Domino News' }] }),
  component: SearchPage,
})

const SINCE_LABELS = {
  all: 'Any time',
  '24h': 'Past day',
  '7d': 'Past week',
  '30d': 'Past month',
} as const

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

  const selectClass =
    'min-h-10 border-2 border-text bg-canvas px-2 text-label font-semibold text-text'

  return (
    <Page>
      <PageTitle>Search</PageTitle>
      <search className="block max-w-4xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex gap-2">
            <TextInput
              label="Search stories and narratives"
              hideLabel
              name="q"
              type="search"
              defaultValue={search.q}
              placeholder="Search stories and narratives"
              className="flex-1"
              autoFocus
            />
            <Button type="submit" variant="primary">
              Search
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label htmlFor={sinceId} className="type-label">
              Updated
            </label>
            <select id={sinceId} name="since" defaultValue={search.since} className={selectClass}>
              {Object.entries(SINCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label htmlFor={pubId} className="type-label">
              Outlet
            </label>
            <select
              id={pubId}
              name="publisher"
              defaultValue={search.publisher ?? ''}
              className={selectClass}
            >
              <option value="">Any outlet</option>
              {publishers.data?.items.map((p) => (
                <option key={p.id} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
            <label htmlFor={regionId} className="type-label">
              Region
            </label>
            <select
              id={regionId}
              name="region"
              defaultValue={search.region ?? ''}
              className={selectClass}
            >
              <option value="">Any region</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {REGION_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        </form>
      </search>

      <div className="mt-10 max-w-4xl" aria-live="polite">
        {!search.q ? (
          <p className="text-text-muted">Search by topic, person, place or outlet.</p>
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
          <>
            <p className="mb-4 type-meta">
              {results.data.hits.length} results ·{' '}
              {results.data.mode === 'hybrid'
                ? 'keyword and meaning'
                : 'keyword only (embedding service unavailable)'}
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
                      <p className="mt-2 type-meta">{hit.storyCount} stories</p>
                    </>
                  ) : (
                    <>
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
          </>
        )}
      </div>
    </Page>
  )
}
