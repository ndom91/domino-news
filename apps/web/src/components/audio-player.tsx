import { plural } from '@dn/domain'
import { CaretDownIcon, DownloadSimpleIcon, PauseIcon, PlayIcon } from '@phosphor-icons/react'
import { type CSSProperties, useRef, useState } from 'react'

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
    <div className="bg-band text-band-text">
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
      <div className="audio-player-grid px-4 pt-4 md:px-5 md:pt-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause briefing' : 'Play briefing'}
          className="audio-player-play grid size-16 place-items-center bg-accent text-accent-contrast md:size-tap"
        >
          {playing ? (
            <PauseIcon size={25} weight="fill" aria-hidden />
          ) : (
            <PlayIcon size={25} weight="fill" aria-hidden />
          )}
        </button>
        <div className="audio-player-heading min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id="audio-briefing-title" className="type-headline text-band-text">
              Listen to your briefing
            </h2>
            <span className="border border-band-line px-2 py-0.5 type-label text-band-text">
              Beta
            </span>
            <span className="w-full text-sm text-band-muted md:w-auto">
              {plural(storyCount, 'story', 'stories')} from your feed
            </span>
          </div>
        </div>
        <div className="audio-player-seek min-w-0">
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
            className="audio-seek"
            style={
              {
                '--seek-progress': `${duration ? Math.min(100, (position / duration) * 100) : 0}%`,
              } as CSSProperties
            }
          />
          <div
            className="-mt-2 flex justify-between text-sm font-bold text-band-muted tabular-nums md:hidden"
            aria-hidden="true"
          >
            <span>{clock(position)}</span>
            <span>{clock(duration)}</span>
          </div>
        </div>
        <span className="audio-player-time hidden text-right text-sm font-bold tabular-nums md:block">
          {clock(position)} / {clock(duration)}
        </span>
        <button
          type="button"
          aria-label="Go back 15 seconds"
          onClick={() => seek(position - 15)}
          disabled={!duration}
          className="audio-player-back min-h-tap min-w-tap px-2 text-sm font-bold md:border md:border-band-line"
        >
          −15s
        </button>
        <button
          type="button"
          aria-label={`Playback speed ${rate} times. Change speed`}
          onClick={changeRate}
          className="audio-player-speed min-h-tap min-w-tap px-2 text-sm font-bold md:border md:border-band-line"
        >
          {rate}×
        </button>
        <button
          type="button"
          aria-label="Go forward 15 seconds"
          onClick={() => seek(position + 15)}
          disabled={!duration}
          className="audio-player-forward min-h-tap min-w-tap px-2 text-sm font-bold md:border md:border-band-line"
        >
          +15s
        </button>
        <button
          type="button"
          aria-expanded={transcriptOpen}
          aria-controls="audio-transcript-panel"
          onClick={onToggleTranscript}
          className="audio-player-transcript inline-flex min-h-tap items-center justify-between gap-1.5 border-t border-band-line px-4 text-sm font-semibold md:border-2 md:border-band-text md:bg-band-text md:px-3 md:text-band"
        >
          <span>
            <span className="md:hidden">Transcript and stories</span>
            <span className="hidden md:inline">Transcript</span>
          </span>
          <CaretDownIcon
            size={14}
            weight="bold"
            aria-hidden
            className={`transition-transform duration-(--dn-duration-enter) ${transcriptOpen ? 'rotate-180' : ''}`}
          />
        </button>
        <a
          href={src}
          download="domino-briefing.wav"
          aria-label="Download audio"
          className="audio-player-download grid min-h-tap min-w-tap place-items-center md:hidden"
        >
          <DownloadSimpleIcon size={20} aria-hidden />
        </a>
      </div>
      <p className="hidden px-5 pb-3 text-sm text-band-muted md:block">
        AI-generated audio digest. Check what you hear against the linked stories.
      </p>
      {error ? (
        <p role="alert" className="px-4 pb-3 text-sm text-band-text">
          {error}
        </p>
      ) : null}
    </div>
  )
}
