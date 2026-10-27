import { feedbackMutation } from '@dn/queries'
import type { BriefingResponse, ForYouReason } from '@dn/schemas'
import { Button, IconButton, Notice, StoryItem, StoryItemSkeleton } from '@dn/ui'
import { ThumbsDownIcon, ThumbsUpIcon } from '@phosphor-icons/react'
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { RouterLink } from '../components/link.tsx'
import { Page } from '../components/page.tsx'
import { api, queries } from '../lib/api.ts'

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
  return (
    <Page>
      <header className="grid border-b-2 border-rule pb-5 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.32fr)] md:items-end md:gap-x-column">
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
      <AudioBriefingPrototype />
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
            <BriefingSection key={section.kind} section={section} now={now} first={index === 0} />
          ))}
        </div>
      ) : (
        <p className="text-text-secondary">No stories in the last three days yet.</p>
      )}
    </Page>
  )
}

// On-demand prototype: audio exists only in this page's memory.
function AudioBriefingPrototype() {
  const [briefing, setBriefing] = useState<{
    audio: string
    transcript: string
    stories: { title: string; slug: string }[]
  } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  useEffect(
    () => () => {
      if (briefing) URL.revokeObjectURL(briefing.audio)
    },
    [briefing],
  )

  async function generate() {
    setPending(true)
    setError('')
    try {
      const response = await fetch('/api/v1/briefing/audio-prototype', { method: 'POST' })
      if (!response.ok) {
        const body = await response.json()
        throw new Error(body.error?.message || 'Could not prepare your audio briefing.')
      }
      const data = (await response.json()) as {
        audio: string
        transcript: string
        stories: { title: string; slug: string }[]
      }
      const bytes = Uint8Array.from(atob(data.audio), (char) => char.charCodeAt(0))
      setBriefing({ ...data, audio: URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })) })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare your audio briefing.')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="border-b-2 border-rule py-6" aria-labelledby="audio-briefing-title">
      <h2 id="audio-briefing-title" className="type-section">
        Listen to your briefing
      </h2>
      <p className="mt-2 max-w-reading text-text-secondary">
        An experimental, AI-written audio briefing of up to five stories from your personalised
        feed. Preparing it may take a few minutes.
      </p>
      <div className="mt-4">
        <Button onClick={generate} loading={pending} disabled={pending}>
          {briefing ? 'Prepare a new briefing' : 'Prepare audio briefing'}
        </Button>
      </div>
      <p className="mt-2 text-text-secondary" aria-live="polite">
        {pending ? 'Preparing your audio briefing…' : ''}
      </p>
      {error ? (
        <Notice tone="error" title="Audio briefing unavailable">
          {error}
        </Notice>
      ) : null}
      {briefing ? (
        <div className="mt-4 max-w-reading">
          {/* biome-ignore lint/a11y/useMediaCaption: The complete generated transcript is available immediately below; this prototype has no timed captions. */}
          <audio
            controls
            preload="none"
            src={briefing.audio}
            aria-label="Your audio briefing"
            className="w-full"
          />
          <details className="mt-4">
            <summary>Transcript and stories</summary>
            <p className="mt-3 whitespace-pre-line text-text-secondary">{briefing.transcript}</p>
            <ul className="mt-4 flex flex-col gap-2">
              {briefing.stories.map((story) => (
                <li key={story.slug}>
                  <Link to="/stories/$slug" params={{ slug: story.slug }} className="link-inline">
                    {story.title}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}
    </section>
  )
}

function BriefingSection({
  section,
  now,
  first,
}: {
  section: BriefingResponse['sections'][number]
  now: string
  first: boolean
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
          <BriefingCard key={item.story.id} item={item} now={now} />
        ))}
      </div>
    </section>
  )
}

function BriefingCard({
  item,
  now,
}: {
  item: BriefingResponse['sections'][number]['items'][number]
  now: string
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
