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
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
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
  head: () => ({ meta: [{ title: 'Search · Domino Wire' }] }),
  component: SearchPage,
})

const SINCE_OPTIONS = [
  { value: 'all', label: 'Any time' },
  { value: '24h', label: 'Past day' },
  { value: '7d', label: 'Past week' },
  { value: '30d', label: 'Past month' },
] as const

const REGION_OPTIONS = regionOptions('Any region')

// Search after a pause in typing: long enough to skip mid-word queries, short enough to feel
// live. One- and two-letter queries wait for Enter (they match almost everything).
const DEBOUNCE_MS = 300
const MIN_LIVE_LENGTH = 3

function SearchPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/search' })
  // Keep the last results on screen while the next query loads, instead of a skeleton per pause.
  const results = useQuery({ ...queries.search(search), placeholderData: keepPreviousData })
  const publishers = useQuery(queries.publishers())
  const sinceId = useId()
  const pubId = useId()
  const regionId = useId()

  const formRef = useRef<HTMLFormElement>(null)
  // The query field keeps its own text so typing never waits on the router or loses focus;
  // it follows the URL on back and forward. `written` is what it last sent, so the URL
  // catching up (possibly a keystroke behind) isn't copied back over newer typing.
  const [query, setQuery] = useState(search.q)
  const written = useRef(search.q)
  useEffect(() => {
    if (search.q !== written.current) {
      written.current = search.q
      setQuery(search.q)
    }
  }, [search.q])

  // Reads the whole form, so a pending query and the filters always go together. A select
  // passes its new value in `set`: its hidden input only updates after the change event.
  // `push` adds a history entry (Enter, filter changes); typing replaces the current one.
  function apply({ push, set = {} }: { push: boolean; set?: Record<string, string | null> }) {
    const form = formRef.current
    if (!form) return
    const data = new FormData(form)
    const field = (name: string) => (name in set ? set[name] : data.get(name)) ?? ''
    const q = String(field('q')).trim()
    written.current = q
    navigate({
      search: {
        q,
        type: search.type,
        since: (String(field('since')) || 'all') as typeof search.since,
        publisher: String(field('publisher')) || undefined,
        region: regionSchema.safeParse(field('region')).data,
      },
      replace: !push,
    })
  }

  // Debounced live search while typing.
  useEffect(() => {
    const q = query.trim()
    if (q === written.current || (q.length > 0 && q.length < MIN_LIVE_LENGTH)) return
    const timer = setTimeout(() => apply({ push: false }), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  })

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    apply({ push: true })
  }

  return (
    <Page>
      <PageTitle>Search</PageTitle>
      <search className="block max-w-4xl">
        {/* Keyed on the filters (not the query) so back/forward resets the selects without
            remounting the field being typed in. */}
        <form
          ref={formRef}
          key={JSON.stringify({ ...search, q: undefined })}
          onSubmit={onSubmit}
          className="flex flex-col gap-3"
        >
          <div className="flex gap-2">
            <TextInput
              label="Search stories and narratives"
              hideLabel
              name="q"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
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
            <Select
              id={sinceId}
              name="since"
              options={SINCE_OPTIONS}
              defaultValue={search.since}
              onValueChange={(since) => apply({ push: true, set: { since } })}
            />
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
              onValueChange={(publisher) => apply({ push: true, set: { publisher } })}
            />
            <label htmlFor={regionId} className="type-label">
              Region
            </label>
            <Select
              id={regionId}
              name="region"
              options={REGION_OPTIONS}
              defaultValue={search.region ?? null}
              onValueChange={(region) => apply({ push: true, set: { region } })}
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
