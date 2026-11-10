import { ApiError } from '@dn/api-client'
import type { AudioBriefingResult } from '@dn/schemas'
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio'
import * as FileSystem from 'expo-file-system/legacy'
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'

type Result = Pick<AudioBriefingResult, 'transcript' | 'stories'>

function useBriefingPlayer() {
  const player = useAudioPlayer(null)
  const [result, setResult] = useState<Result | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
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
    let path: string | null = null
    try {
      const briefing = await api.prepareAudioBriefing(
        { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        abort.signal,
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
      if (!abort.signal.aborted) setError(preparationError(err))
    } finally {
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
  return { player, result, pending, error, generate, cancel, play }
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
