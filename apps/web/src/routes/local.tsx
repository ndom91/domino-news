import { countryName, KNOWN_COUNTRIES } from '@dn/domain'
import { savePreferencesMutation } from '@dn/queries'
import type { LocalScope, Place, StoryListItem } from '@dn/schemas'
import {
  Button,
  ConfirmDialog,
  Notice,
  SectionHeader,
  Select,
  Skeleton,
  StoryItem,
  TextInput,
} from '@dn/ui'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useBlocker } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { RouterLink } from '../components/link.tsx'
import { Page, PageTitle } from '../components/page.tsx'
import { api, queries } from '../lib/api.ts'

export const Route = createFileRoute('/local')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureInfiniteQueryData(queries.local()),
      context.queryClient.ensureQueryData(queries.preferences()),
    ])
    return { now: new Date().toISOString() }
  },
  head: () => ({ meta: [{ title: 'Local · Domino Wire' }] }),
  pendingComponent: LocalSkeleton,
  component: LocalPage,
})

const COUNTRY_OPTIONS = [
  { value: null, label: 'Choose a country' },
  ...KNOWN_COUNTRIES.map((code) => ({ value: code, label: countryName(code) })).sort((a, b) =>
    a.label.localeCompare(b.label),
  ),
]

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
      <PageTitle meta={locality ? localityLabel(locality) : 'Choose your location'}>
        Local
      </PageTitle>
      <p className="mb-8 max-w-reading text-md text-text-secondary">
        Stories tied to where you live, ordered from your city to your county or local area, then
        your country. Your city and county are only used when you choose to save them.
      </p>

      <LocalityForm key={`${first?.source}:${JSON.stringify(locality)}`} fallback={locality} />

      {first?.source === 'request' ? (
        <Notice className="mt-6" title={`Showing ${countryName(locality?.country ?? '')}`}>
          This country comes from your current connection and is not saved. Add your city or county
          for closer stories.
        </Notice>
      ) : null}

      {feed.isError ? (
        <Notice tone="error" title="Local stories could not be loaded" className="mt-8">
          {feed.error.message} Try again.
        </Notice>
      ) : !locality ? (
        <section className="mt-10 border-y border-border py-10" aria-labelledby="local-empty">
          <h2 id="local-empty" className="type-section">
            Set your location
          </h2>
          <p className="mt-3 max-w-reading text-text-secondary">
            Choose at least a country above. Adding a city or county makes the feed more specific.
          </p>
        </section>
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

function LocalityForm({ fallback }: { fallback: Place | null }) {
  const queryClient = useQueryClient()
  const preferences = useQuery(queries.preferences())
  const save = useMutation(savePreferencesMutation(api, queryClient))
  const canonical = preferences.data?.locality ?? fallback
  const [city, setCity] = useState(canonical?.city ?? '')
  const [county, setCounty] = useState(canonical?.county ?? '')
  const [country, setCountry] = useState<string | null>(canonical?.country ?? null)
  const normalized = {
    city: city.trim() || null,
    county: county.trim() || null,
    country,
  }
  const dirty =
    normalized.city !== (canonical?.city ?? null) ||
    normalized.county !== (canonical?.county ?? null) ||
    normalized.country !== (canonical?.country ?? null)
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!country) return
    save.mutate({ locality: { city: normalized.city, county: normalized.county, country } })
  }

  function clear() {
    save.mutate({ locality: null })
  }

  return (
    <form
      onSubmit={submit}
      className="border-y-2 border-rule bg-sunken px-4 py-5 md:px-6"
      aria-label="Local news location"
    >
      <div className="grid grid-cols-3 gap-4 max-md:grid-cols-1">
        <TextInput
          label="City"
          name="city"
          autoComplete="address-level2"
          value={city}
          maxLength={100}
          onChange={(event) => setCity(event.target.value)}
        />
        <TextInput
          label="County or local area"
          name="county"
          autoComplete="address-level1"
          value={county}
          maxLength={100}
          onChange={(event) => setCounty(event.target.value)}
        />
        <Select
          label="Country"
          name="country"
          options={COUNTRY_OPTIONS}
          value={country}
          onValueChange={setCountry}
        />
      </div>
      <p className="mt-3 text-sm text-text-muted">
        City and county are optional. We do not request or store your precise coordinates.
      </p>
      {save.isError ? (
        <Notice tone="error" title="Location not saved" className="mt-4">
          {save.error.message} Try again.
        </Notice>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="submit" variant="primary" loading={save.isPending} disabled={!country}>
          Save location
        </Button>
        {preferences.data?.locality ? (
          <Button type="button" variant="ghost" loading={save.isPending} onClick={clear}>
            Use automatic country
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={blocker.status === 'blocked'}
        title="Discard your location changes?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      >
        Your city, county or country has not been saved.
      </ConfirmDialog>
    </form>
  )
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
