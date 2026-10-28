import { plural } from '@dn/domain'
import type { BriefingResponse } from '@dn/schemas'
import { Button, Notice } from '@dn/ui'
import { PlayIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import type { useAudioBriefing } from '../lib/use-audio-briefing.ts'
import { AudioPlayer } from './audio-player.tsx'

type AudioState = ReturnType<typeof useAudioBriefing>

export function AudioBriefingPrototype({
  preview,
  audio,
}: {
  preview: BriefingResponse['audioStories']
  audio: AudioState
}) {
  const { briefing, pending, error, stage, selected, generate, cancel } = audio
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [fullTranscript, setFullTranscript] = useState(false)
  const paragraphs = briefing?.transcript.split(/\n\s*\n/) ?? []
  const stageIndex = stage === 'selecting' ? 0 : stage === 'writing' ? 1 : 2

  return (
    <section className="pt-3 pb-2" aria-labelledby="audio-briefing-title">
      {briefing && !pending ? (
        <>
          <AudioPlayer
            key={briefing.audio}
            src={briefing.audio}
            storyCount={briefing.stories.length}
            transcriptOpen={transcriptOpen}
            onToggleTranscript={() => setTranscriptOpen((open) => !open)}
          />
          <div
            id="audio-transcript-panel"
            hidden={!transcriptOpen}
            className="border border-border-strong bg-sunken p-5 md:p-6"
          >
            <div className="grid gap-8 md:grid-cols-[minmax(0,1.8fr)_minmax(0,0.7fr)] md:gap-column">
              <div id="audio-transcript">
                <h3 className="type-label">Transcript</h3>
                <p className="mt-4 max-w-reading whitespace-pre-line text-base leading-normal">
                  {(fullTranscript ? paragraphs : paragraphs.slice(0, 3)).join('\n\n')}
                </p>
                {paragraphs.length > 3 ? (
                  <div className="mt-4">
                    <Button
                      className="w-full md:w-auto"
                      onClick={() => setFullTranscript((full) => !full)}
                      aria-expanded={fullTranscript}
                    >
                      {fullTranscript ? 'Show less transcript' : 'Show full transcript'}
                    </Button>
                  </div>
                ) : null}
              </div>
              <AudioStoryList stories={briefing.stories} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-2 md:justify-end">
            <p className="text-sm text-text-secondary md:hidden">
              AI-generated audio digest. Check what you hear against the linked stories.
            </p>
            <div className="flex flex-wrap items-center gap-x-4">
              <a
                href={briefing.audio}
                download="domino-briefing.wav"
                className="link-inline hidden min-h-tap content-center text-sm font-semibold md:block"
              >
                Download audio
              </a>
              <button
                type="button"
                className="link-inline min-h-tap text-sm font-semibold"
                onClick={() => {
                  setFullTranscript(false)
                  setTranscriptOpen(false)
                  void generate()
                }}
              >
                Prepare a new briefing
              </button>
              <AudioSettings />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="bg-band px-4 py-4 text-band-text md:px-5">
            <div className="flex flex-wrap items-stretch gap-4">
              <span
                aria-hidden="true"
                className="grid size-18 shrink-0 self-center place-items-center border border-band-line text-band-muted"
              >
                <PlayIcon size={18} weight="fill" />
              </span>
              <div className="min-w-48 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h2 id="audio-briefing-title" className="type-headline">
                    Listen to your briefing
                  </h2>
                  <span className="border border-band-line px-2 py-0.5 type-label">
                    Beta
                  </span>
                </div>
                <p className="mt-1 text-sm text-band-muted">
                  <span aria-live="polite">
                    {pending
                      ? stage === 'selecting'
                        ? 'Choosing stories…'
                        : stage === 'writing'
                          ? 'Writing the script…'
                          : 'Recording the voice…'
                      : preview.length
                        ? 'The top stories from your feed, written up and read aloud. Takes a few minutes.'
                        : 'No recent stories with summaries are available yet.'}
                  </span>{' '}
                  AI-generated audio digest.
                </p>
              </div>
              {pending ? (
                <button
                  type="button"
                  onClick={cancel}
                  className="min-h-tap self-center border border-band-line px-4 font-semibold"
                >
                  Cancel preparation
                </button>
              ) : (
                <button
                  type="button"
                  onClick={generate}
                  disabled={!preview.length}
                  className="inline-flex min-h-tap items-center justify-center gap-2 self-center bg-accent px-4 font-semibold text-accent-contrast disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <PlayIcon size={16} weight="fill" aria-hidden /> Prepare audio briefing
                </button>
              )}
            </div>
            {pending ? (
              <div className="mt-4 max-w-reading">
                <ol className="grid grid-cols-3 gap-1 text-sm text-band-muted">
                  {[
                    selected
                      ? `Picked ${plural(selected.length, 'story', 'stories')}`
                      : 'Choose stories',
                    'Write the script',
                    'Record the voice',
                  ].map((label, index) => (
                    <li
                      key={label}
                      className={`min-w-0 ${index === stageIndex ? 'font-bold text-band-text' : ''}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mb-3 block h-1.5 border border-band-line ${index < stageIndex ? 'bg-band-text' : index === stageIndex ? 'bg-accent' : 'bg-transparent'}`}
                      />
                      <span className="block pr-2">
                        {label}
                        {index === stageIndex
                          ? ' (in progress)'
                          : index < stageIndex
                            ? ' (done)'
                            : ''}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
          <div className="flex justify-end pt-2">
            <AudioSettings />
          </div>
        </>
      )}
      {error ? (
        <Notice tone="error" title="Audio briefing unavailable" className="mt-4">
          {error}
        </Notice>
      ) : null}
    </section>
  )
}

function AudioSettings() {
  return (
    <Link
      to="/account"
      search={{ tab: 'preferences' }}
      hash="audio-style"
      className="link-inline min-h-tap content-center text-sm font-semibold"
    >
      Audio settings
    </Link>
  )
}

function AudioStoryList({ stories }: { stories: { title: string; slug: string }[] }) {
  return (
    <div>
      <h3 className="type-label">Stories in this briefing</h3>
      <ol className="mt-3 divide-y divide-border">
        {stories.map((story, index) => (
          <li key={story.slug} className="flex gap-3 py-2">
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
    </div>
  )
}
