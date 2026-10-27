import { plural } from '@dn/domain'
import { PauseIcon, PlayIcon } from '@phosphor-icons/react'
import { useRef, useState } from 'react'

function clock(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`
}

export function AudioPlayer({
  src,
  storyCount,
  transcriptOpen,
  onToggleTranscript,
}: {
  src: string
  storyCount: number
  transcriptOpen: boolean
  onToggleTranscript: () => void
}) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRate] = useState(1)
  const [error, setError] = useState('')

  async function toggle() {
    const element = audio.current
    if (!element) return
    if (!element.paused) return element.pause()
    try {
      setError('')
      await element.play()
    } catch {
      setError('Audio could not be played. Try again or download the recording.')
    }
  }
  function seek(time: number) {
    const element = audio.current
    if (!element || !Number.isFinite(element.duration)) return
    element.currentTime = Math.max(0, Math.min(element.duration, time))
    setPosition(element.currentTime)
  }
  function changeRate() {
    const element = audio.current
    if (!element) return
    const speeds = [1, 1.25, 1.5, 2, 0.75]
    element.playbackRate = speeds[(speeds.indexOf(rate) + 1) % speeds.length] ?? 1
    setRate(element.playbackRate)
  }

  return (
    <div className="bg-band px-4 py-3 text-band-text md:px-5">
      {/* biome-ignore lint/a11y/useMediaCaption: The full transcript is provided alongside the player. */}
      <audio
        ref={audio}
        preload="metadata"
        src={src}
        aria-label="Your audio briefing"
        aria-details="audio-transcript"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) =>
          setDuration(
            Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0,
          )
        }
        onError={() => setError('Audio could not be loaded. Try preparing your briefing again.')}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause briefing' : 'Play briefing'}
          className="grid size-tap shrink-0 place-items-center bg-accent text-accent-contrast"
        >
          {playing ? (
            <PauseIcon size={25} weight="fill" aria-hidden />
          ) : (
            <PlayIcon size={25} weight="fill" aria-hidden />
          )}
        </button>
        <div className="min-w-48 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id="audio-briefing-title" className="type-headline text-band-text">
              Listen to your briefing
            </h2>
            <span className="border border-band-line px-2 py-0.5 type-label text-band-text">
              Experimental
            </span>
            <span className="text-sm text-band-muted">
              {plural(storyCount, 'story', 'stories')} from your feed
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step="0.1"
            value={Math.min(position, duration || 1)}
            disabled={!duration}
            aria-label="Seek audio briefing"
            aria-valuetext={`${clock(position)} of ${clock(duration)}`}
            onChange={(event) => seek(Number(event.target.value))}
            className="min-h-tap w-full cursor-pointer accent-accent"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-24 text-right text-sm font-bold tabular-nums">
            {clock(position)} / {clock(duration)}
          </span>
          <button
            type="button"
            aria-label="Go back 15 seconds"
            onClick={() => seek(position - 15)}
            disabled={!duration}
            className="min-h-tap min-w-tap border border-band-line px-2 text-sm font-bold"
          >
            −15s
          </button>
          <button
            type="button"
            aria-label={`Playback speed ${rate} times. Change speed`}
            onClick={changeRate}
            className="min-h-tap min-w-tap border border-band-line px-2 text-sm font-bold"
          >
            {rate}×
          </button>
          <button
            type="button"
            aria-label="Go forward 15 seconds"
            onClick={() => seek(position + 15)}
            disabled={!duration}
            className="min-h-tap min-w-tap border border-band-line px-2 text-sm font-bold"
          >
            +15s
          </button>
          <button
            type="button"
            aria-expanded={transcriptOpen}
            aria-controls="audio-transcript-panel"
            onClick={onToggleTranscript}
            className="min-h-tap border-2 border-band-text bg-band-text px-3 text-sm font-semibold text-band"
          >
            Transcript <span aria-hidden="true">{transcriptOpen ? '⌃' : '⌄'}</span>
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-band-text">
          {error}
        </p>
      ) : null}
    </div>
  )
}
