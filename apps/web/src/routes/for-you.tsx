import type { ForYouReason } from '@dn/schemas'
import { Button, Notice, Skeleton, StoryItem } from '@dn/ui'
import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { RouterLink } from '../components/link.tsx'
import { Page, PageTitle } from '../components/page.tsx'
import { queries } from '../lib/api.ts'

export const Route = createFileRoute('/for-you')({
  loader: ({ context }) => context.queryClient.prefetchInfiniteQuery(queries.forYou()),
  head: () => ({ meta: [{ title: 'For You · Domino News' }] }),
  component: ForYouPage,
})

const REASON_PREFIX: Record<ForYouReason['kind'], string> = {
  narrative: 'You follow',
  publisher: 'From',
  topic: '',
  region: '',
  desk: '',
}

/** "You follow Sudan's civil war · Europe · Science": why this card is here. */
function reasonLine(reasons: ForYouReason[]) {
  return reasons
    .map((r) => (REASON_PREFIX[r.kind] ? `${REASON_PREFIX[r.kind]} ${r.label}` : r.label))
    .join(' · ')
}

// Per user and client-only, like Blindspot.
function ForYouPage() {
  const feed = useInfiniteQuery(queries.forYou())
  const first = feed.data?.pages[0]
  const items = feed.data?.pages.flatMap((p) => p.items) ?? []
  const now = new Date().toISOString()

  return (
    <Page>
      <PageTitle meta="Ranked by what you follow and pick">For You</PageTitle>
      {feed.isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : feed.isError ? (
        <Notice tone="error" title="For You could not be loaded">
          {feed.error.message}
        </Notice>
      ) : (
        <>
          {!first?.personalised ? (
            <section className="mb-12 max-w-reading">
              <p className="text-md text-text-secondary">
                Pick the regions, desks and topics you care about, and follow narratives or outlets
                from their pages. Matching stories move to the top here. Nothing is hidden: big
                stories still show, just lower down.
              </p>
              <Link
                to="/account"
                hash="your-feed"
                className="mt-4 inline-block text-base font-bold underline decoration-accent decoration-2 underline-offset-4"
              >
                Set up your feed
              </Link>
            </section>
          ) : null}
          <div className="grid grid-cols-3 gap-x-column gap-y-12 max-lg:grid-cols-2 max-md:grid-cols-1">
            {items.map(({ story, reasons }) => (
              <div key={story.id} className="flex flex-col gap-2">
                <StoryItem story={story} now={now} Link={RouterLink} />
                {reasons.length > 0 ? <p className="type-meta">{reasonLine(reasons)}</p> : null}
              </div>
            ))}
          </div>
          {items.length === 0 ? (
            <p className="text-text-secondary">No stories in the last three days yet.</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-6 pt-12 pb-16">
            {feed.hasNextPage ? (
              <Button onClick={() => feed.fetchNextPage()} loading={feed.isFetchingNextPage}>
                Show more
              </Button>
            ) : null}
            {first?.personalised ? (
              <Link to="/account" hash="your-feed" className="link-inline font-semibold">
                Change your picks
              </Link>
            ) : null}
          </div>
        </>
      )}
    </Page>
  )
}
