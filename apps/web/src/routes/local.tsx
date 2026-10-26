import { countryName } from '@dn/domain'
import type { LocalScope, Place, StoryListItem } from '@dn/schemas'
import { Button, Notice, SectionHeader, Skeleton, StoryItem } from '@dn/ui'
import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { RouterLink } from '../components/link.tsx'
import { Page, PageTitle } from '../components/page.tsx'
import { queries } from '../lib/api.ts'

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
      <PageTitle meta={locality ? localityLabel(locality) : 'Choose your location'}>
        Local
      </PageTitle>
      <p className="mb-8 max-w-reading text-md text-text-secondary">
        Stories tied to where you live, ordered from your city to your county or local area, then
        your country.{' '}
        <Link
          to="/account"
          search={{ tab: 'preferences' }}
          hash="local-stories"
          className="link-inline font-semibold"
        >
          Improve your local stories by setting your location here.
        </Link>
      </p>

      {first?.source === 'request' ? (
        <Notice title={`Showing ${countryName(locality?.country ?? '')}`}>
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
            Use the location link above to choose a country. Adding a city or county makes the feed
            more specific.
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
