import { feedbackMutation } from '@dn/queries'
import type { BriefingResponse, ForYouReason } from '@dn/schemas'
import { Button, IconButton, Notice, StoryItem, StoryItemSkeleton } from '@dn/ui'
import { ThumbsDownIcon, ThumbsUpIcon } from '@phosphor-icons/react'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { AudioBriefingPrototype } from '../components/audio-briefing.tsx'
import { RouterLink } from '../components/link.tsx'
import { Page } from '../components/page.tsx'
import { api, queries } from '../lib/api.ts'
import { useAudioBriefing } from '../lib/use-audio-briefing.ts'

export const Route = createFileRoute('/briefing')({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(queries.briefing())
    return { now: new Date().toISOString() }
  },
  pendingComponent: BriefingSkeleton,
  head: () => ({ meta: [{ title: 'Briefing · Domino Wire' }] }),
  component: BriefingPage,
})

function BriefingPage() {
  const { now } = Route.useLoaderData()
  const { data: briefing } = useSuspenseQuery(queries.briefing())
  const audio = useAudioBriefing()
  const audioPositions = new Map(
    (audio.pending ? [] : (audio.briefing?.stories ?? [])).map((story, index) => [
      story.slug,
      index + 1,
    ]),
  )
  return (
    <Page>
      <header className="grid pb-2 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.32fr)] md:items-end md:gap-x-column">
        <div>
          <p className="mb-3 type-label text-accent-text">Your news desk</p>
          <h1 className="type-display-md text-[clamp(2.5rem,4vw,4rem)]">Briefing</h1>
        </div>
        <p className="mt-6 text-base leading-snug text-text-secondary md:mt-0">
          {briefing.since
            ? 'What changed since your last briefing.'
            : 'Your first briefing: a considered view of the news now.'}
        </p>
      </header>
      <AudioBriefingPrototype preview={briefing.audioStories} audio={audio} />
      {!briefing.personalised ? (
        <Notice tone="neutral" title="Make this briefing yours" className="mt-8 max-w-reading">
          Pick the regions, desks and topics you care about, or follow a narrative or publisher.
          Important stories still appear even without picks.
          <Link
            to="/account"
            search={{ tab: 'preferences' }}
            className="ml-1 link-inline font-semibold"
          >
            Set your preferences
          </Link>
        </Notice>
      ) : null}
      {briefing.sections.length ? (
        <div className="flex flex-col gap-16 pt-4 pb-16 md:gap-20">
          {briefing.sections.map((section, index) => (
            <BriefingSection
              key={section.kind}
              section={section}
              now={now}
              first={index === 0}
              audioPositions={audioPositions}
            />
          ))}
        </div>
      ) : (
        <p className="text-text-secondary">No stories in the last three days yet.</p>
      )}
    </Page>
  )
}

function BriefingSection({
  section,
  now,
  first,
  audioPositions,
}: {
  section: BriefingResponse['sections'][number]
  now: string
  first: boolean
  audioPositions: ReadonlyMap<string, number>
}) {
  return (
    <section aria-labelledby={`briefing-${section.kind}`}>
      <div className={first ? 'pt-4' : 'border-t-2 border-rule pt-4'}>
        <h2 id={`briefing-${section.kind}`} className="type-period">
          {section.title}
        </h2>
        <p className="mt-2 max-w-reading text-base leading-snug text-text-secondary">
          {section.description}
        </p>
      </div>
      <div className="mt-8 grid grid-cols-3 gap-x-column gap-y-12 max-lg:grid-cols-2 max-md:grid-cols-1">
        {section.items.map((item) => (
          <BriefingCard
            key={item.story.id}
            item={item}
            now={now}
            audioPosition={audioPositions.get(item.story.slug)}
          />
        ))}
      </div>
    </section>
  )
}

function BriefingCard({
  item,
  now,
  audioPosition,
}: {
  item: BriefingResponse['sections'][number]['items'][number]
  now: string
  audioPosition?: number
}) {
  const queryClient = useQueryClient()
  const save = useMutation(feedbackMutation(api, queryClient))
  const [feedback, setFeedback] = useState(item.feedback)
  const [hidden, setHidden] = useState(false)

  function send(signal: 'more' | 'less' | null, onError?: () => void) {
    const previous = feedback
    setFeedback(signal)
    save.mutate(
      { storyId: item.story.id, signal },
      {
        onError: () => {
          setFeedback(previous)
          onError?.()
        },
      },
    )
  }

  if (hidden) {
    return (
      <article
        className="flex min-h-44 flex-col justify-center border-l-2 border-border px-4"
        aria-live="polite"
      >
        <p className="font-semibold">Hidden from your Briefing</p>
        <p className="mt-1 text-sm leading-normal text-text-secondary">
          You’ll see fewer stories like “{item.story.title}”.
        </p>
        <div className="mt-4">
          <Button
            size="sm"
            loading={save.isPending}
            onClick={() => {
              setHidden(false)
              send(null)
            }}
          >
            Undo
          </Button>
        </div>
      </article>
    )
  }

  return (
    <article className="flex flex-col">
      <StoryItem story={item.story} now={now} Link={RouterLink} showFirstReport={false} />
      {audioPosition ? (
        <p className="mt-2">
          <span className="border border-border-strong px-2 py-1 type-label">
            Selected for audio · {String(audioPosition).padStart(2, '0')}
          </span>
        </p>
      ) : null}
      {item.update ? (
        <p className="mt-3 text-sm font-semibold leading-snug text-text-secondary">
          {item.update.description}
        </p>
      ) : null}
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="type-meta text-text-muted">{reasonText(item.reasons)}</p>
        <div className="-mr-2 flex shrink-0">
          <IconButton
            label={`More stories like ${item.story.title}`}
            className="text-text-muted hover:not-data-disabled:border-text-muted hover:not-data-disabled:text-text aria-pressed:text-text"
            aria-pressed={feedback === 'more'}
            disabled={save.isPending}
            icon={<ThumbsUpIcon size={20} weight={feedback === 'more' ? 'fill' : 'regular'} />}
            onClick={() => send(feedback === 'more' ? null : 'more')}
          />
          <IconButton
            label={`Fewer stories like ${item.story.title}`}
            className="text-text-muted hover:not-data-disabled:border-text-muted hover:not-data-disabled:text-text"
            disabled={save.isPending}
            icon={<ThumbsDownIcon size={20} />}
            onClick={() => {
              setHidden(true)
              send('less', () => setHidden(false))
            }}
          />
        </div>
      </div>
      {save.isError ? (
        <p role="alert" className="mt-2 text-sm text-error">
          Couldn’t save that. Try again.
        </p>
      ) : null}
    </article>
  )
}

function reasonText(reasons: ForYouReason[]) {
  const reason = reasons[0]
  if (!reason) return 'Included to keep your briefing broad.'
  switch (reason.kind) {
    case 'narrative':
      return `You follow ${reason.label}.`
    case 'publisher':
      return `From ${reason.label}, which you follow.`
    case 'topic':
      return `Topic you picked: ${reason.label}.`
    case 'region':
      return `Region you picked: ${reason.label}.`
    case 'desk':
      return `Desk you picked: ${reason.label}.`
    case 'learned':
      return `You asked for more ${reason.label}.`
  }
}

function BriefingSkeleton() {
  return (
    <Page>
      <h1 className="sr-only">Briefing</h1>
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading briefing"
        className="grid grid-cols-3 gap-x-column gap-y-12 max-lg:grid-cols-2 max-md:grid-cols-1"
      >
        <StoryItemSkeleton />
        <StoryItemSkeleton />
        <StoryItemSkeleton />
      </div>
    </Page>
  )
}
