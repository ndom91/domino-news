import { nativeTokens as t } from '@dn/design-tokens/native'
import { useAudioPlayerStatus } from 'expo-audio'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAudioBriefing } from './audio-briefing-provider'
import { Button, uiStyles } from './ui'

export function AudioBriefing({ available }: { available: boolean }) {
  const router = useRouter()
  const { player, result, pending, error, generate, cancel, play } = useAudioBriefing()
  const status = useAudioPlayerStatus(player)
  const [transcript, setTranscript] = useState(false)
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
          <Button tone="light" onPress={cancel}>
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
          <Button tone="light" onPress={() => (status.playing ? player.pause() : void play())}>
            {status.playing ? 'Pause' : 'Play'}
          </Button>
          {status.error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              Playback failed. Try preparing the briefing again.
            </Text>
          ) : null}
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
