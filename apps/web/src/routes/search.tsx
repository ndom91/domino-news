import { relativeTime } from '@dn/domain'
import { Badge, Button, Notice, Skeleton, TextInput } from '@dn/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useId } from 'react'
import { z } from 'zod'
import { Page } from '../components/page.tsx'
import { queries } from '../lib/api.ts'

const searchParams = z.object({
  q: z.string().optional().default(''),
  type: z.enum(['all', 'story', 'narrative']).optional().default('all'),
  since: z.enum(['24h', '7d', '30d', 'all']).optional().default('all'),
  publisher: z.string().optional(),
})

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

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    navigate({
      search: {
        q: String(form.get('q') ?? '').trim(),
        type: search.type,
        since: (form.get('since') as typeof search.since) ?? 'all',
        publisher: String(form.get('publisher') ?? '') || undefined,
      },
    })
  }

  const selectClass =
    'h-10 rounded-md border border-border-strong bg-surface px-2 text-sm text-text focus:outline-2 focus:outline-focus'

  return (
    <Page className="max-w-3xl!">
      <h1 className="font-serif text-2xl font-medium tracking-tight md:text-3xl">Search</h1>
      <search className="mt-6 block">
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
            <label htmlFor={sinceId} className="text-text-secondary">
              Updated
            </label>
            <select id={sinceId} name="since" defaultValue={search.since} className={selectClass}>
              {Object.entries(SINCE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label htmlFor={pubId} className="text-text-secondary">
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
          </div>
        </form>
      </search>

      <div className="mt-10" aria-live="polite">
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
            <p className="mb-4 font-mono text-xs text-text-muted">
              {results.data.hits.length} results ·{' '}
              {results.data.mode === 'hybrid'
                ? 'keyword and meaning'
                : 'keyword only (embedding service unavailable)'}
            </p>
            <ol className="flex flex-col divide-y divide-border border-t border-rule">
              {results.data.hits.map((hit) => (
                <li key={`${hit.type}-${hit.id}`} className="py-5">
                  {hit.type === 'narrative' ? (
                    <>
                      <Badge>Narrative</Badge>
                      <Link
                        to="/narratives/$slug"
                        params={{ slug: hit.slug }}
                        className="mt-2 block font-serif text-lg leading-snug hover:underline underline-offset-4"
                      >
                        {hit.title}
                      </Link>
                      {hit.description ? (
                        <p className="mt-1 text-sm text-text-secondary">{hit.description}</p>
                      ) : null}
                      <p className="mt-2 font-mono text-xs text-text-muted">
                        {hit.storyCount} stories
                      </p>
                    </>
                  ) : (
                    <>
                      <Link
                        to="/stories/$slug"
                        params={{ slug: hit.slug }}
                        className="font-serif text-lg leading-snug hover:underline underline-offset-4"
                      >
                        {hit.title}
                      </Link>
                      {hit.summary ? (
                        <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
                          {hit.summary}
                        </p>
                      ) : null}
                      <p className="mt-2 font-mono text-xs text-text-muted">
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
