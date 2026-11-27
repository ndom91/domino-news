import { ApiError } from '@dn/api-client'
import { type AudioBriefingResult, audioBriefingResultSchema } from '@dn/schemas'
import { fetch } from 'expo/fetch'
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio'
import * as FileSystem from 'expo-file-system/legacy'
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import { authClient } from '../lib/auth-client'
import { apiUrl } from '../lib/config'

type Result = Pick<AudioBriefingResult, 'transcript' | 'stories'>
export type BriefingStage = 'selecting' | 'writing' | 'recording'
type Story = AudioBriefingResult['stories'][number]

// Briefing generation allows 120s for the script, 180s for speech, plus response transfer.
const BRIEFING_TIMEOUT_MS = 330_000

/**
 * Streams the briefing as NDJSON so the reader sees each stage. React Native's built-in
 * fetch can't read a body incrementally; expo/fetch can.
 */
async function streamBriefing(
  signal: AbortSignal,
  onStage: (stage: BriefingStage) => void,
  onSelected: (stories: Story[]) => void,
): Promise<AudioBriefingResult> {
  const cookie = await authClient.getCookie()
  let response: Awaited<ReturnType<typeof fetch>>
  try {
    response = await fetch(`${apiUrl}/api/v1/briefing/audio-prototype`, {
      method: 'POST',
      headers: {
        accept: 'application/x-ndjson',
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      credentials: 'omit',
      signal,
    })
  } catch (error) {
    throw new ApiError(0, 'network', String(error))
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error?.message || 'Could not prepare your briefing.')
  }
  if (!response.body) throw new Error('Could not read the briefing response.')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let result: AudioBriefingResult | undefined
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += chunk.value
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      const event = JSON.parse(buffer.slice(0, newline))
      buffer = buffer.slice(newline + 1)
      if (event.type === 'selected') onSelected(event.stories)
      else if (event.type === 'stage' && (event.stage === 'writing' || event.stage === 'recording'))
        onStage(event.stage)
      else if (event.type === 'result') result = audioBriefingResultSchema.parse(event)
      else if (event.type === 'error')
        throw new Error(event.message || 'Could not prepare your briefing.')
      newline = buffer.indexOf('\n')
    }
  }
  if (buffer.trim() || !result)
    throw new Error('The briefing response was incomplete. Please try again.')
  return result
}

function useBriefingPlayer() {
  const player = useAudioPlayer(null)
  const [result, setResult] = useState<Result | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [stage, setStage] = useState<BriefingStage>('selecting')
  const [selected, setSelected] = useState<Story[] | null>(null)
  const controller = useRef<AbortController | null>(null)
  const file = useRef<string | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controller.current?.abort()
      if (file.current)
        void FileSystem.deleteAsync(file.current, { idempotent: true }).catch(console.warn)
    }
  }, [])

  async function generate() {
    if (controller.current) return
    const abort = new AbortController()
    controller.current = abort
    setPending(true)
    setError('')
    setStage('selecting')
    setSelected(null)
    let path: string | null = null
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      abort.abort()
    }, BRIEFING_TIMEOUT_MS)
    try {
      const briefing = await streamBriefing(
        abort.signal,
        (next) => mounted.current && setStage(next),
        (stories) => mounted.current && setSelected(stories),
      )
      if (!FileSystem.cacheDirectory) throw new Error('Audio storage is unavailable.')
      path = `${FileSystem.cacheDirectory}briefing-${Date.now()}.wav`
      await FileSystem.writeAsStringAsync(path, briefing.audio, {
        encoding: FileSystem.EncodingType.Base64,
      })
      if (abort.signal.aborted) return
      player.pause()
      player.clearLockScreenControls()
      player.replace(path)
      const previous = file.current
      file.current = path
      path = null
      if (previous) void FileSystem.deleteAsync(previous, { idempotent: true }).catch(console.warn)
      setResult({ transcript: briefing.transcript, stories: briefing.stories })
    } catch (err) {
      if (timedOut && mounted.current)
        setError('Preparing your briefing took too long. Please try again.')
      else if (!abort.signal.aborted) setError(preparationError(err))
    } finally {
      clearTimeout(timer)
      if (path) void FileSystem.deleteAsync(path, { idempotent: true }).catch(console.warn)
      controller.current = null
      if (mounted.current) setPending(false)
    }
  }

  function cancel() {
    controller.current?.abort()
  }

  async function play() {
    try {
      setError('')
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      })
      if (!mounted.current) return
      if (player.currentStatus.didJustFinish) await player.seekTo(0)
      if (!mounted.current) return
      player.setActiveForLockScreen(
        true,
        { title: 'Your audio briefing', artist: 'Domino Wire' },
        { showSeekBackward: true, showSeekForward: true },
      )
      player.play()
    } catch (err) {
      if (mounted.current)
        setError(err instanceof Error ? err.message : 'Could not play your briefing. Try again.')
    }
  }
  return { player, result, pending, error, stage, selected, generate, cancel, play }
}

// API errors carry a message for the reader; a failed connection only carries the platform's.
function preparationError(error: unknown): string {
  if (error instanceof ApiError && error.code === 'network') {
    return 'Could not reach Domino Wire. Check your connection and try again.'
  }
  return error instanceof Error ? error.message : 'Could not prepare your briefing.'
}

const AudioBriefingContext = createContext<ReturnType<typeof useBriefingPlayer> | null>(null)

export function AudioBriefingProvider({ children }: { children: ReactNode }) {
  const value = useBriefingPlayer()
  return <AudioBriefingContext.Provider value={value}>{children}</AudioBriefingContext.Provider>
}

export function useAudioBriefing() {
  const value = useContext(AudioBriefingContext)
  if (!value) throw new Error('AudioBriefingProvider is missing')
  return value
}
