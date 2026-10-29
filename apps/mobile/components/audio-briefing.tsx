import { nativeTokens as t } from '@dn/design-tokens/native'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import * as FileSystem from 'expo-file-system/legacy'
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, StyleSheet, Text, View } from 'react-native'
import { authClient } from '../lib/auth-client'
import { apiUrl } from '../lib/config'
import { Button, uiStyles } from './ui'

type Result = { transcript: string; stories: { title: string; slug: string }[] }

export function AudioBriefing({ available }: { available: boolean }) {
  const router = useRouter()
  const player = useAudioPlayer(null)
  const status = useAudioPlayerStatus(player)
  const [result, setResult] = useState<Result | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [transcript, setTranscript] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const file = useRef<string | null>(null)
  useFocusEffect(
    useCallback(
      () => () => {
        player.pause()
      },
      [player],
    ),
  )
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') player.pause()
    })
    return () => listener.remove()
  }, [player])
  useEffect(
    () => () => {
      controller.current?.abort()
      if (file.current)
        void FileSystem.deleteAsync(file.current, { idempotent: true }).catch(console.warn)
    },
    [],
  )
  async function generate() {
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
      if (abort.signal.aborted) {
        await FileSystem.deleteAsync(path, { idempotent: true })
        return
      }
      player.pause()
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
      setPending(false)
    }
  }
  return (
    <View style={styles.section}>
      <Text style={uiStyles.label}>Listen to your briefing · Beta</Text>
      <Text style={styles.text}>
        AI-generated audio may contain errors. Preparing it can take a few minutes.
      </Text>
      {pending ? (
        <>
          <Text accessibilityLiveRegion="polite" style={styles.text}>
            Preparing your briefing…
          </Text>
          <Button tone="light" onPress={() => controller.current?.abort()}>
            Cancel preparation
          </Button>
        </>
      ) : (
        <Button disabled={!available} onPress={() => void generate()}>
          {result ? 'Prepare a new briefing' : 'Prepare audio briefing'}
        </Button>
      )}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      {result ? (
        <>
          <Button tone="light" onPress={() => (status.playing ? player.pause() : player.play())}>
            {status.playing ? 'Pause' : 'Play'}
          </Button>
          <Text style={styles.text}>
            {Math.floor(status.currentTime)} / {Math.floor(status.duration)} seconds
          </Text>
          <View style={styles.controls}>
            <Button
              tone="light"
              onPress={() => void player.seekTo(Math.max(0, status.currentTime - 15))}
            >
              Back 15 seconds
            </Button>
            <Button
              tone="light"
              onPress={() => void player.seekTo(Math.min(status.duration, status.currentTime + 15))}
            >
              Forward 15 seconds
            </Button>
          </View>
          <Button tone="light" onPress={() => setTranscript(!transcript)}>
            {transcript ? 'Hide transcript' : 'Show transcript'}
          </Button>
          {transcript ? (
            <Text selectable style={styles.text}>
              {result.transcript}
            </Text>
          ) : null}
          {result.stories.map((story) => (
            <Button
              key={story.slug}
              tone="light"
              onPress={() => router.push(`/stories/${story.slug}`)}
            >
              {story.title}
            </Button>
          ))}
        </>
      ) : null}
      <Button tone="light" onPress={() => router.push('/account')}>
        Audio settings
      </Button>
    </View>
  )
}
const styles = StyleSheet.create({
  section: { gap: t.space[3], marginVertical: t.space[5] },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] },
  text: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 22,
  },
  error: { color: t.color.error, fontFamily: t.font.medium },
})
