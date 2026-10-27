import { plural } from '@dn/domain'
import type { BriefingResponse } from '@dn/schemas'
import { Button, Notice } from '@dn/ui'
import { Link } from '@tanstack/react-router'
import { useAudioBriefing } from '../lib/use-audio-briefing.ts'

// On-demand prototype: audio exists only in this page's memory.
export function AudioBriefingPrototype({ preview }: { preview: BriefingResponse['audioStories'] }) {
  const { briefing, pending, error, generate, cancel } = useAudioBriefing()

  return (
    <section className="border-b-2 border-rule py-8" aria-labelledby="audio-briefing-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="type-label text-text-muted">
          Listen · {pending ? 'Preparing' : briefing ? 'Ready to play' : 'Ready to prepare'}
        </p>
        <Link
          to="/account"
          search={{ tab: 'preferences' }}
          hash="audio-style"
          className="link-inline min-h-tap content-center text-sm font-semibold"
        >
          Audio settings
        </Link>
      </div>
      {briefing && !pending ? (
        <>
          <div className="flex flex-wrap items-center gap-4 border-t-2 border-rule pt-5 pb-5">
            <h2 id="audio-briefing-title" className="type-section">
              Your briefing
            </h2>
            <span className="border border-border-strong px-2 py-1 type-label">Experimental</span>
          </div>
          <div className="bg-band p-5 text-band-text">
            <p className="mb-3 type-label text-band-muted">Your audio briefing</p>
            {/* biome-ignore lint/a11y/useMediaCaption: A full transcript is provided below. */}
            <audio
              controls
              preload="metadata"
              src={briefing.audio}
              aria-label="Your audio briefing"
              aria-describedby="audio-transcript"
              className="w-full"
            />
          </div>
          <div className="grid gap-8 py-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:gap-column">
            <div id="audio-transcript">
              <h3 className="border-b-2 border-rule pb-2 type-label">Transcript</h3>
              <p className="mt-4 max-w-reading whitespace-pre-line text-base leading-normal">
                {briefing.transcript}
              </p>
            </div>
            <AudioStoryList stories={briefing.stories} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
            <p className="max-w-reading text-sm text-text-secondary">
              AI-written and AI-read. Check what you hear against the linked stories.
            </p>
            <Button onClick={generate}>Prepare a new briefing</Button>
          </div>
          {error ? (
            <Notice tone="error" title="Audio briefing unavailable" className="mt-4">
              {error}
            </Notice>
          ) : null}
        </>
      ) : (
        <div className="grid gap-8 border-t-2 border-rule pt-5 pb-2 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-column">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <h2 id="audio-briefing-title" className="type-section">
                Listen to your briefing
              </h2>
              <span className="border border-border-strong px-2 py-1 type-label">Experimental</span>
            </div>
            <p className="mt-4 max-w-reading text-base leading-snug text-text-secondary">
              The top stories from your feed, written up and read aloud. Explore the linked stories
              for their sources.
            </p>
            <p className="mt-4 text-sm font-semibold" aria-live="polite">
              {pending ? 'Preparing your briefing… Keep reading; this may take a few minutes.' : ''}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-4">
              {pending ? (
                <Button onClick={cancel}>Cancel preparation</Button>
              ) : (
                <Button variant="primary" onClick={generate} disabled={!preview.length}>
                  Prepare audio briefing
                </Button>
              )}
              {!pending ? (
                <span className="text-sm text-text-muted">Takes a few minutes</span>
              ) : null}
            </div>
            <p className="mt-5 max-w-reading text-sm text-text-muted">
              AI-written and AI-read. Your name is sent to the writing and voice services so the
              briefing can greet you.
            </p>
            {error ? (
              <Notice tone="error" title="Audio briefing unavailable" className="mt-4">
                {error}
              </Notice>
            ) : null}
          </div>
          <AudioStoryList stories={preview} preview />
        </div>
      )}
    </section>
  )
}

function AudioStoryList({
  stories,
  preview = false,
}: {
  stories: { title: string; slug: string }[]
  preview?: boolean
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 border-b-2 border-rule pb-2">
        <h3 className="type-label">{preview ? 'In this briefing' : 'Stories'}</h3>
        <span className="text-sm text-text-muted">
          {plural(stories.length, 'story', 'stories')} · from For You
        </span>
      </div>
      {stories.length ? (
        <ol className="divide-y divide-border">
          {stories.map((story, index) => (
            <li key={story.slug} className="flex gap-4 py-3">
              <span className="type-meta font-bold tabular-nums">
                {String(index + 1).padStart(2, '0')}
              </span>
              <Link
                to="/stories/$slug"
                params={{ slug: story.slug }}
                className="link-inline min-h-tap font-semibold"
              >
                {story.title}
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-text-secondary">
          No recent stories with summaries are available yet.
        </p>
      )}
      {preview && stories.length ? (
        <p className="mt-3 text-sm text-text-muted">
          Selection may change when you prepare your briefing.
        </p>
      ) : null}
    </div>
  )
}
