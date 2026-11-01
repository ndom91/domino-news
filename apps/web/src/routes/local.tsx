import { countryName } from '@dn/domain'
import { savePreferencesMutation } from '@dn/queries'
import type { LocalScope, Place, StoryListItem } from '@dn/schemas'
import {
  Button,
  ConfirmDialog,
  Notice,
  SectionHeader,
  Skeleton,
  StoryItem,
  TextInput,
} from '@dn/ui'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useBlocker } from '@tanstack/react-router'
import { useState } from 'react'
import { RouterLink } from '../components/link.tsx'
import { Page, PageTitle } from '../components/page.tsx'
import { api, queries } from '../lib/api.ts'

export const Route = createFileRoute('/local')({
  loader: async ({ context }) => {
    await context.queryClient.ensureInfiniteQueryData(queries.local())
    return { now: new Date().toISOString() }
  },
  head: () => ({ meta: [{ title: 'Local · Domino Wire' }] }),
  pendingComponent: LocalSkeleton,
  component: LocalPage,
})

const SCOPE_ORDER: LocalScope[] = ['city', 'county', 'country']

function LocalPage() {
  const { now } = Route.useLoaderData()
  const feed = useInfiniteQuery(queries.local())
  const first = feed.data?.pages[0]
  const items = feed.data?.pages.flatMap((page) => page.items) ?? []
  const locality = first?.locality ?? null
  const grouped = new Map<LocalScope, StoryListItem[]>()
  for (const { story, scope } of items) {
    const stories = grouped.get(scope) ?? []
    stories.push(story)
    grouped.set(scope, stories)
  }

  return (
    <Page>
      <LocalHeader locality={locality} source={first?.source} />

      {feed.isError ? (
        <Notice tone="error" title="Local stories could not be loaded" className="mt-8">
          {feed.error.message} Try again.
        </Notice>
      ) : !locality ? (
        <p className="mt-6 pb-16 text-text-secondary">Choose a country to see local stories.</p>
      ) : items.length === 0 ? (
        <p className="mt-10 pb-16 text-text-secondary">
          No stories are tied to {localityLabel(locality)} yet. New reporting will appear here when
          its location matches.
        </p>
      ) : (
        <>
          <div className="mt-2">
            {SCOPE_ORDER.map((scope) => {
              const stories = grouped.get(scope)
              if (!stories?.length) return null
              return (
                <section key={scope} aria-labelledby={`local-${scope}`}>
                  <SectionHeader id={`local-${scope}`} title={scopeTitle(scope, locality)} />
                  <div className="grid grid-cols-3 gap-x-column gap-y-12 max-lg:grid-cols-2 max-md:grid-cols-1">
                    {stories.map((story) => (
                      <StoryItem key={story.id} story={story} now={now} Link={RouterLink} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
          <div className="pt-12 pb-16">
            {feed.hasNextPage ? (
              <Button onClick={() => feed.fetchNextPage()} loading={feed.isFetchingNextPage}>
                Show more local stories
              </Button>
            ) : null}
          </div>
        </>
      )}
    </Page>
  )
}

function LocalHeader({ locality, source }: { locality: Place | null; source?: string | null }) {
  const queryClient = useQueryClient()
  const save = useMutation(savePreferencesMutation(api, queryClient))
  const [city, setCity] = useState('')
  const configured = Boolean(locality?.city || locality?.county)
  const dirty = Boolean(city.trim()) && !configured && !save.isSuccess
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  })
  const places = [
    { key: 'city', label: locality?.city },
    { key: 'county', label: locality?.county },
    { key: 'country', label: locality && countryName(locality.country) },
  ].filter((place) => Boolean(place.label))

  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border pb-3">
        <h1 className="type-section">Local</h1>
        {configured ? (
          <>
            <ol aria-label="Your location" className="flex min-w-0 flex-wrap items-center gap-2">
              {places.map((place, index) => (
                <li key={place.key} className="flex min-w-0 max-w-full items-center gap-2">
                  {index > 0 ? <span aria-hidden="true">›</span> : null}
                  <span
                    className={
                      index === 0
                        ? 'min-w-0 bg-text px-2 py-1 text-sm font-semibold break-words text-canvas'
                        : 'min-w-0 border border-text px-2 py-1 text-sm font-semibold break-words'
                    }
                  >
                    {place.label}
                  </span>
                </li>
              ))}
            </ol>
            <LocationLink className="ml-auto" label="Change location" />
          </>
        ) : null}
      </div>
      {!configured ? (
        <div className="mt-3 grid gap-6 bg-text p-5 text-canvas md:grid-cols-2">
          <div>
            <h2 className="type-section">Set your location to see stories from where you live.</h2>
            <p className="mt-2 max-w-reading text-sm">
              Local lists your city first, then your local area, then your country. A story counts
              as local when it’s about that place, wherever the publisher is based.
            </p>
            <p className="mt-4 text-sm font-semibold">
              1 · City　›　2 · Local area　›　3 · Country
            </p>
          </div>
          <div>
            {locality ? (
              <>
                <p className="text-sm">
                  {source === 'request' ? 'Based on your connection: ' : 'Country: '}
                  <strong>{countryName(locality.country)}</strong>
                </p>
                <form
                  className="mt-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const value = city.trim()
                    if (value)
                      save.mutate({
                        locality: { city: value, county: null, country: locality.country },
                      })
                  }}
                >
                  <div className="flex flex-wrap items-end gap-2">
                    <TextInput
                      label="City or town"
                      name="city"
                      autoComplete="address-level2"
                      maxLength={100}
                      required
                      pattern=".*\S.*"
                      title="Enter a city or town."
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                      className="min-w-0 flex-1 text-canvas"
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      loading={save.isPending}
                      className="border-canvas bg-canvas text-text hover:not-data-disabled:bg-text hover:not-data-disabled:text-canvas"
                    >
                      Save location
                    </Button>
                  </div>
                </form>
                {save.isError ? (
                  <p role="alert" className="mt-2 text-sm">
                    Location not saved. {save.error.message} Try again.
                  </p>
                ) : null}
                <p className="mt-2 text-sm">Saved to your account. Change it any time.</p>
              </>
            ) : (
              <p className="text-sm">
                Choose your country and optionally add a city or local area.
              </p>
            )}
            <LocationLink className="mt-2" label="Choose country or local area" />
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={blocker.status === 'blocked'}
        title="Discard your location changes?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      >
        Your city has not been saved.
      </ConfirmDialog>
    </header>
  )
}

function LocationLink({ className, label }: { className?: string; label: string }) {
  return (
    <Link
      to="/account"
      search={{ tab: 'preferences' }}
      hash="local-stories"
      className={`inline-flex min-h-tap items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline ${className ?? ''}`}
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
      {label}
    </Link>
  )
}

function localityLabel(place: Place) {
  return place.city ?? place.county ?? countryName(place.country)
}

function scopeTitle(scope: LocalScope, place: Place) {
  if (scope === 'city') return `In ${place.city}`
  if (scope === 'county') return `Across ${place.county}`
  return place.city || place.county
    ? `Elsewhere in ${countryName(place.country)}`
    : `Across ${countryName(place.country)}`
}

function LocalSkeleton() {
  return (
    <Page>
      <PageTitle>Local</PageTitle>
      <div role="status" aria-busy="true" aria-label="Loading local stories">
        <Skeleton className="h-24 w-full" />
        <div className="mt-10 grid grid-cols-3 gap-x-column gap-y-12 max-lg:grid-cols-2 max-md:grid-cols-1">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    </Page>
  )
}
