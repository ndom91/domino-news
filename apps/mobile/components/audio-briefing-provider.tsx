import { setAudioModeAsync, useAudioPlayer } from 'expo-audio'
import * as FileSystem from 'expo-file-system/legacy'
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import { authClient } from '../lib/auth-client'
import { apiUrl } from '../lib/config'

type Result = { transcript: string; stories: { title: string; slug: string }[] }

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
      const cookie = await authClient.getCookie()
      const response = await fetch(`${apiUrl}/api/v1/briefing/audio-prototype`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', cookie },
        body: JSON.stringify({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        signal: abort.signal,
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error?.message ?? 'Could not prepare your briefing.')
      if (!FileSystem.cacheDirectory) throw new Error('Audio storage is unavailable.')
      path = `${FileSystem.cacheDirectory}briefing-${Date.now()}.wav`
      await FileSystem.writeAsStringAsync(path, body.audio, {
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
      setResult({ transcript: body.transcript, stories: body.stories })
    } catch (err) {
      if (!abort.signal.aborted)
        setError(err instanceof Error ? err.message : 'Could not prepare your briefing.')
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
