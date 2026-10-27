import { plural } from '@dn/domain'
import type { BriefingResponse } from '@dn/schemas'
import { Button, Notice } from '@dn/ui'
import { PlayIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useAudioBriefing } from '../lib/use-audio-briefing.ts'
import { AudioPlayer } from './audio-player.tsx'

// On-demand prototype: audio exists only in this page's memory.
export function AudioBriefingPrototype({ preview }: { preview: BriefingResponse['audioStories'] }) {
  const { briefing, pending, error, stage, selected, generate, cancel } = useAudioBriefing()
  const [fullTranscript, setFullTranscript] = useState(false)
  const paragraphs = briefing?.transcript.split(/\n\s*\n/) ?? []
  const stageIndex = stage === 'selecting' ? 0 : stage === 'writing' ? 1 : 2

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
          <AudioPlayer key={briefing.audio} src={briefing.audio} />
          <div className="grid gap-8 py-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:gap-column">
            <div id="audio-transcript">
              <h3 className="border-b-2 border-rule pb-2 type-label">Transcript</h3>
              <p className="mt-4 max-w-reading whitespace-pre-line text-base leading-normal">
                {(fullTranscript ? paragraphs : paragraphs.slice(0, 3)).join('\n\n')}
              </p>
              {paragraphs.length > 3 ? (
                <div className="mt-4">
                  <Button
                    onClick={() => setFullTranscript(!fullTranscript)}
                    aria-expanded={fullTranscript}
                  >
                    {fullTranscript ? 'Show less transcript' : 'Show full transcript'}
                  </Button>
                </div>
              ) : null}
            </div>
            <AudioStoryList stories={briefing.stories} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
            <p className="max-w-reading text-sm text-text-secondary">
              AI-generated audio digest. Check what you hear against the linked stories.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={briefing.audio}
                download="domino-briefing.wav"
                className="link-inline min-h-tap content-center font-semibold"
              >
                Download audio
              </a>
              <Button
                onClick={() => {
                  setFullTranscript(false)
                  void generate()
                }}
              >
                Prepare a new briefing
              </Button>
            </div>
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
            {pending ? (
              <div className="mt-5">
                <p className="text-sm font-semibold" aria-live="polite">
                  {stage === 'selecting'
                    ? 'Choosing stories…'
                    : stage === 'writing'
                      ? 'Writing the script…'
                      : 'Recording the voice…'}{' '}
                  Keep reading; it’ll be here when it’s ready.
                </p>
                <div className="mt-4 flex gap-1" aria-hidden="true">
                  {[0, 1, 2].map((step) => (
                    <span
                      key={step}
                      className={`h-2 flex-1 border border-border-strong ${step < stageIndex ? 'bg-text' : step === stageIndex ? 'bg-accent' : 'bg-transparent'}`}
                    />
                  ))}
                </div>
                <ol className="mt-3 flex flex-col gap-1 text-sm">
                  {[
                    selected
                      ? `Picked ${plural(selected.length, 'story', 'stories')} from For You`
                      : 'Choose stories',
                    'Write the script',
                    'Record the voice',
                  ].map((label, index) => (
                    <li
                      key={label}
                      className={
                        index === stageIndex ? 'font-bold text-text' : 'text-text-secondary'
                      }
                    >
                      <span
                        aria-hidden="true"
                        className={`mr-2 inline-block size-2 border border-border-strong ${index < stageIndex ? 'bg-text' : index === stageIndex ? 'bg-accent' : 'bg-transparent'}`}
                      />
                      {label}
                      {index === stageIndex
                        ? ' (in progress)'
                        : index < stageIndex
                          ? ' (done)'
                          : ''}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-4">
              {pending ? (
                <Button onClick={cancel}>Cancel preparation</Button>
              ) : (
                <Button variant="primary" onClick={generate} disabled={!preview.length}>
                  <PlayIcon size={16} weight="fill" aria-hidden /> Prepare audio briefing
                </Button>
              )}
              {!pending ? (
                <span className="text-sm text-text-muted">Takes a few minutes</span>
              ) : null}
            </div>
            <p className="mt-5 max-w-reading text-sm text-text-muted">AI-generated audio digest.</p>
            {error ? (
              <Notice tone="error" title="Audio briefing unavailable" className="mt-4">
                {error}
              </Notice>
            ) : null}
          </div>
          <AudioStoryList stories={pending ? (selected ?? preview) : preview} preview />
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
    </div>
  )
}
