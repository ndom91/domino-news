import { feedbackMutation } from '@dn/queries'
import { DESK_LABELS, type ForYouReason, type ForYouResponse, TOPIC_LABELS } from '@dn/schemas'
import { Button, cx, IconButton, Notice, Popover, Skeleton, StoryItem } from '@dn/ui'
import { InfoIcon, ThumbsDownIcon, ThumbsUpIcon } from '@phosphor-icons/react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { type CSSProperties, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { RouterLink } from '../components/link.tsx'
import { Page, PageTitle } from '../components/page.tsx'
import { api, queries } from '../lib/api.ts'

export const Route = createFileRoute('/for-you')({
  loader: async ({ context }) => {
    await context.queryClient.prefetchInfiniteQuery(queries.forYou())
    return { now: new Date().toISOString() }
  },
  head: () => ({ meta: [{ title: 'For You · Domino Wire' }] }),
  component: ForYouPage,
})

function ForYouPage() {
  const { now } = Route.useLoaderData()
  const feed = useInfiniteQuery(queries.forYou())
  const first = feed.data?.pages[0]
  // Hidden cards leave the grid once their notice times out (the server leaves them out of
  // later fetches anyway). Local state, so removal can render synchronously for the reflow.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const items = (feed.data?.pages.flatMap((p) => p.items) ?? []).filter(
    (i) => !removed.has(i.story.id),
  )

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
                Pick the regions, desks and topics you care about, and follow narratives or
                publishers from their pages. Matching stories move to the top here. Nothing is
                hidden: big stories still show, just lower down.
              </p>
              <Link
                to="/account"
                search={{ tab: 'preferences' }}
                hash="your-feed"
                className="mt-4 inline-block link-inline text-base font-bold"
              >
                Set up your feed
              </Link>
            </section>
          ) : null}
          <div className="grid grid-cols-3 gap-x-column gap-y-12 max-lg:grid-cols-2 max-md:grid-cols-1">
            {items.map((item) => (
              <ForYouCard
                key={item.story.id}
                item={item}
                now={now}
                onRemove={(id) => setRemoved((prev) => new Set(prev).add(id))}
              />
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
              <Link
                to="/account"
                search={{ tab: 'preferences' }}
                hash="your-feed"
                className="link-inline font-semibold"
              >
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

/** One line per reason, e.g. "You follow Sudan's civil war", "Topic you picked: Climate". */
function reasonText(r: ForYouReason) {
  switch (r.kind) {
    case 'narrative':
      return `You follow ${r.label}`
    case 'publisher':
      return `From ${r.label}, which you follow`
    case 'topic':
      return `Topic you picked: ${r.label}`
    case 'region':
      return `Region you picked: ${r.label}`
    case 'desk':
      return `Desk you picked: ${r.label}`
    case 'learned':
      return `You asked for more ${r.label}`
  }
}

/** "i" button: why this Story is on For You. Hover on desktop; click or tap everywhere. */
function WhyButton({ reasons }: { reasons: ForYouReason[] }) {
  return (
    <Popover
      openOnHover
      side="top"
      title="Why you're seeing this"
      trigger={
        // Plain <button>, not Button: info only, so no hover fill.
        <button
          type="button"
          aria-label="Why you're seeing this"
          className="grid size-tap cursor-help place-items-center text-text-muted transition-colors duration-(--dn-duration-fast) hover:text-text"
        >
          <InfoIcon size={22} aria-hidden />
        </button>
      }
    >
      {reasons.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {reasons.map((r) => (
            <li key={`${r.kind}-${r.label}`}>{reasonText(r)}</li>
          ))}
        </ul>
      ) : (
        <p>
          It's one of the most widely covered stories right now. Pick topics or follow narratives to
          tailor For You.
        </p>
      )}
    </Popover>
  )
}

/** A motion token in ms (0 under reduced motion, where the tokens are zeroed). */
function tokenMs(name: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return Number.parseFloat(value) || 0
}

/**
 * Remove a card and let the rest glide into place (View Transition, scoped by html.vt-feed).
 * Instant without support or with reduced motion.
 */
function reflowWithout(remove: () => void) {
  const root = document.documentElement
  if (typeof document.startViewTransition !== 'function' || tokenMs('--dn-duration-enter') === 0) {
    remove()
    return
  }
  root.classList.add('vt-feed')
  document
    .startViewTransition(() => flushSync(remove))
    .finished.finally(() => root.classList.remove('vt-feed'))
}

type Phase = 'card' | 'hiding' | 'notice' | 'leaving'

/**
 * A For You card with "more / less like this". Less fades the card into a notice of the same
 * size; after a short countdown (paused on hover or focus) the notice fades and the grid
 * reflows without it. Undo brings the card back.
 */
function ForYouCard({
  item,
  now,
  onRemove,
}: {
  item: Item
  now: string
  onRemove: (storyId: string) => void
}) {
  const queryClient = useQueryClient()
  const save = useMutation(feedbackMutation(api, queryClient))
  const [feedback, setFeedback] = useState(item.feedback)
  const [phase, setPhase] = useState<Phase>('card')
  const [restored, setRestored] = useState(false)
  const [height, setHeight] = useState<number>()
  const cardRef = useRef<HTMLDivElement>(null)
  const { story } = item

  function send(signal: 'more' | 'less' | null, onError?: () => void) {
    const previous = feedback
    setFeedback(signal)
    save.mutate(
      { storyId: story.id, signal },
      {
        onError: () => {
          setFeedback(previous)
          onError?.()
        },
      },
    )
  }

  function hide() {
    setHeight(cardRef.current?.offsetHeight)
    setPhase('hiding')
    setTimeout(() => setPhase('notice'), tokenMs('--dn-duration-exit'))
    send('less', () => setPhase('card'))
  }

  function undo() {
    setRestored(true)
    setPhase('card')
    send(null)
  }

  function leave() {
    setPhase('leaving')
    setTimeout(() => reflowWithout(() => onRemove(story.id)), tokenMs('--dn-duration-exit'))
  }

  if (phase === 'notice' || phase === 'leaving') {
    const fewer = [
      ...story.topics.map((t) => TOPIC_LABELS[t]),
      ...(story.desk ? [DESK_LABELS[story.desk]] : []),
    ]
    return (
      <div
        role="status"
        style={{ minHeight: height }}
        className={cx(
          'group relative flex flex-col justify-center gap-4 overflow-hidden border-t-6 border-border-strong bg-text/[0.03] px-6 py-8',
          't-feedback-in transition-[opacity,scale] duration-(--dn-duration-exit) ease-out',
          phase === 'leaving' && 'scale-[0.98] opacity-0',
        )}
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 flex-none place-items-center border border-border-strong">
            <ThumbsDownIcon size={20} weight="fill" aria-hidden />
          </span>
          <div>
            <p className="text-md font-bold">Hidden from For You</p>
            <p className="mt-0.5 text-sm text-text-secondary">
              {fewer.length > 0
                ? `You'll see fewer stories about ${fewer.join(', ')}.`
                : "You'll see fewer stories like this."}
            </p>
          </div>
        </div>
        <p className="line-clamp-2 text-sm text-text-muted">{story.title}</p>
        <div>
          <Button size="sm" disabled={phase === 'leaving'} onClick={undo}>
            Undo
          </Button>
        </div>
        <span
          aria-hidden
          className="t-countdown absolute inset-x-0 bottom-0 h-1 origin-left bg-text/40 group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]"
          onAnimationEnd={() => {
            if (phase === 'notice') leave()
          }}
        />
      </div>
    )
  }

  return (
    <div
      ref={cardRef}
      data-feed-card
      style={{ '--vt-name': `card-${story.id}` } as CSSProperties}
      className={cx(
        'flex flex-col transition-[opacity,scale] duration-(--dn-duration-exit) ease-out',
        phase === 'hiding' && 'scale-[0.98] opacity-0',
        restored && 't-feedback-in',
      )}
    >
      {/* First/updated times are in the story bar's tooltip, so no "first" line. */}
      <StoryItem story={story} now={now} Link={RouterLink} showFirstReport={false} />
      {/* Pulled up beside the trace caption; 44px tap areas pad ~11px above each icon. */}
      <div className="-mt-5.5 flex justify-end">
        <div className="flex">
          <WhyButton reasons={item.reasons} />
          <IconButton
            label="More like this"
            className="text-text-muted hover:not-data-disabled:border-text-muted hover:not-data-disabled:text-text aria-pressed:text-text"
            aria-pressed={feedback === 'more'}
            disabled={save.isPending}
            icon={<ThumbsUpIcon size={22} weight={feedback === 'more' ? 'fill' : 'regular'} />}
            onClick={() => send(feedback === 'more' ? null : 'more')}
          />
          <IconButton
            label="Less like this"
            className="text-text-muted hover:not-data-disabled:border-text-muted hover:not-data-disabled:text-text"
            disabled={save.isPending}
            icon={<ThumbsDownIcon size={22} />}
            onClick={hide}
          />
        </div>
      </div>
      {save.isError ? (
        <p role="alert" className="mt-2 text-sm text-error">
          Couldn't save that. Try again.
        </p>
      ) : null}
    </div>
  )
}
