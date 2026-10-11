import { feedbackMutation } from '@dn/queries'
import type { ForYouReason, ForYouResponse } from '@dn/schemas'
import { Button, IconButton, Notice, Skeleton, StoryItem } from '@dn/ui'
import { ThumbsDownIcon, ThumbsUpIcon } from '@phosphor-icons/react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { RouterLink } from '../components/link.tsx'
import { Page, PageTitle } from '../components/page.tsx'
import { api, queries } from '../lib/api.ts'

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
  learned: 'You asked for more',
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
            {items.map((item) => (
              <ForYouCard key={item.story.id} item={item} now={now} />
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

type Item = ForYouResponse['items'][number]

/**
 * A For You card with "more / less like this". Less hides the card in place behind an
 * undo notice; the list re-ranks on the next visit rather than jumping under the reader.
 */
function ForYouCard({ item, now }: { item: Item; now: string }) {
  const queryClient = useQueryClient()
  const save = useMutation(feedbackMutation(api, queryClient))
  const [feedback, setFeedback] = useState(item.feedback)

  function send(signal: 'more' | 'less' | null) {
    const previous = feedback
    setFeedback(signal)
    save.mutate({ storyId: item.story.id, signal }, { onError: () => setFeedback(previous) })
  }

  if (feedback === 'less') {
    return (
      <div className="flex min-h-24 flex-col justify-center gap-1 border-t-6 border-border p-3 text-sm">
        <p className="font-semibold">Hidden. We'll show fewer stories like this.</p>
        <p className="text-text-secondary">
          <button
            type="button"
            className="link-inline font-semibold"
            disabled={save.isPending}
            onClick={() => send(null)}
          >
            Undo
          </button>
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <StoryItem story={item.story} now={now} Link={RouterLink} />
      <div className="flex items-center justify-between gap-3">
        <p className="type-meta">{item.reasons.length > 0 ? reasonLine(item.reasons) : null}</p>
        <div className="flex flex-none">
          <IconButton
            label="More like this"
            aria-pressed={feedback === 'more'}
            disabled={save.isPending}
            icon={<ThumbsUpIcon size={22} weight={feedback === 'more' ? 'fill' : 'regular'} />}
            onClick={() => send(feedback === 'more' ? null : 'more')}
          />
          <IconButton
            label="Less like this"
            disabled={save.isPending}
            icon={<ThumbsDownIcon size={22} />}
            onClick={() => send('less')}
          />
        </div>
      </div>
      {save.isError ? (
        <p role="alert" className="text-sm text-error">
          Couldn't save that. Try again.
        </p>
      ) : null}
    </div>
  )
}
