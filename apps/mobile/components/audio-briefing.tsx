import { nativeTokens as t } from '@dn/design-tokens/native'
import { audioClock, nextPlaybackRate, plural } from '@dn/domain'
import Feather from '@expo/vector-icons/Feather'
import { useAudioPlayerStatus } from 'expo-audio'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { type BriefingStage, useAudioBriefing } from './audio-briefing-provider'

const STAGES: BriefingStage[] = ['selecting', 'writing', 'recording']
const STAGE_STATUS: Record<BriefingStage, string> = {
  selecting: 'Choosing stories…',
  writing: 'Writing the script…',
  recording: 'Recording the voice…',
}
const STEP_SUFFIX = { done: ', done', active: ', in progress', todo: '' }

export function AudioBriefing({ available }: { available: boolean }) {
  const router = useRouter()
  const { player, result, pending, error, stage, selected, generate, cancel, play } =
    useAudioBriefing()
  const stageIndex = STAGES.indexOf(stage)
  const status = useAudioPlayerStatus(player)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [rate, setRate] = useState(1)
  const duration = Number.isFinite(status.duration) ? Math.max(0, status.duration) : 0
  const position = Number.isFinite(status.currentTime)
    ? Math.max(0, Math.min(status.currentTime, duration))
    : 0
  const progress = duration ? position / duration : 0
  function changeRate() {
    const next = nextPlaybackRate(rate)
    player.setPlaybackRate(next)
    setRate(next)
  }
  return (
    <View style={styles.panel}>
      <View style={styles.topRow}>
        {result ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={status.playing ? 'Pause briefing' : 'Play briefing'}
            onPress={() => (status.playing ? player.pause() : void play())}
            style={({ pressed }) => [styles.play, pressed && styles.pressed]}
          >
            <Feather
              name={status.playing ? 'pause' : 'play'}
              size={24}
              color={t.color.accentContrast}
            />
          </Pressable>
        ) : (
          <View aria-hidden style={styles.placeholder}>
            <Feather name="headphones" size={22} color={t.color.bandText} />
          </View>
        )}
        <View style={styles.heading}>
          <View style={styles.headingRow}>
            <View style={styles.titleGroup}>
              <Text style={styles.title}>Listen to your briefing</Text>
              <Text style={styles.beta}>Beta</Text>
            </View>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Audio settings"
              onPress={() => router.push('/account')}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Feather name="settings" size={19} color={t.color.bandText} />
            </Pressable>
          </View>
          <Text style={styles.subhead}>
            {result
              ? `${plural(result.stories.length, 'story', 'stories')} from your feed`
              : available
                ? 'Your top stories, read aloud.'
                : 'No recent stories with summaries yet.'}
          </Text>
        </View>
      </View>

      {result ? (
        <>
          <View
            accessible
            accessibilityLabel={`Playback position ${audioClock(position)} of ${audioClock(duration)}`}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: duration || 1, now: position }}
            style={styles.progressTrack}
          >
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={styles.times}>
            <Text style={styles.time}>{audioClock(position)}</Text>
            <Text style={styles.time}>{audioClock(duration)}</Text>
          </View>
          <View style={styles.controls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back 15 seconds"
              disabled={!duration}
              onPress={() => void player.seekTo(Math.max(0, position - 15))}
              style={({ pressed }) => [styles.smallControl, pressed && styles.pressed]}
            >
              <Text style={styles.controlText}>−15s</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Playback speed ${rate} times. Change speed`}
              onPress={changeRate}
              style={({ pressed }) => [styles.smallControl, pressed && styles.pressed]}
            >
              <Text style={styles.controlText}>{rate}×</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go forward 15 seconds"
              disabled={!duration}
              onPress={() => void player.seekTo(Math.min(duration, position + 15))}
              style={({ pressed }) => [styles.smallControl, pressed && styles.pressed]}
            >
              <Text style={styles.controlText}>+15s</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsOpen }}
              onPress={() => setDetailsOpen(!detailsOpen)}
              style={({ pressed }) => [styles.detailsButton, pressed && styles.pressed]}
            >
              <Text style={styles.controlText}>Transcript & stories</Text>
              <Feather
                name={detailsOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={t.color.bandText}
              />
            </Pressable>
          </View>
        </>
      ) : null}

      {pending ? (
        <>
          <View style={styles.steps}>
            {[
              selected ? `Picked ${plural(selected.length, 'story', 'stories')}` : 'Choose stories',
              'Write the script',
              'Record the voice',
            ].map((label, index) => {
              let state: keyof typeof STEP_SUFFIX = 'todo'
              if (index < stageIndex) state = 'done'
              else if (index === stageIndex) state = 'active'
              return (
                <View
                  key={label}
                  accessible
                  accessibilityLabel={`${label}${STEP_SUFFIX[state]}`}
                  style={styles.step}
                >
                  <View
                    style={[
                      styles.stepBar,
                      state === 'done' && styles.stepBarDone,
                      state === 'active' && styles.stepBarActive,
                    ]}
                  />
                  <Text style={[styles.stepLabel, state === 'active' && styles.stepLabelActive]}>
                    {label}
                  </Text>
                </View>
              )
            })}
          </View>
          <View style={styles.preparation}>
            <Text accessibilityLiveRegion="polite" style={styles.subhead}>
              {STAGE_STATUS[stage]}
            </Text>
            <Pressable accessibilityRole="button" onPress={cancel} style={styles.inlineAction}>
              <Text style={styles.actionText}>Cancel</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          disabled={!available}
          onPress={() => void generate()}
          style={({ pressed }) => [
            result ? styles.inlineAction : styles.prepareButton,
            pressed && styles.pressed,
            !available && styles.disabled,
          ]}
        >
          <Text style={result ? styles.actionText : styles.prepareText}>
            {result ? 'Prepare a new briefing' : 'Prepare audio briefing'}
          </Text>
        </Pressable>
      )}
      {error || status.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error || 'Playback failed. Try preparing the briefing again.'}
        </Text>
      ) : null}
      <Text style={styles.disclaimer}>AI-generated audio. May contain errors.</Text>

      {result && detailsOpen ? (
        <View style={styles.details}>
          <Text accessibilityRole="header" style={styles.detailsHeading}>
            Transcript
          </Text>
          <Text selectable style={styles.transcript}>
            {result.transcript}
          </Text>
          <Text accessibilityRole="header" style={styles.detailsHeading}>
            Stories in this briefing
          </Text>
          {result.stories.map((story, index) => (
            <Pressable
              key={story.slug}
              accessibilityRole="link"
              accessibilityLabel={`Open ${story.title}`}
              onPress={() => router.push(`/stories/${story.slug}`)}
              style={({ pressed }) => [styles.story, pressed && styles.pressed]}
            >
              <Text style={styles.storyNumber}>{String(index + 1).padStart(2, '0')}</Text>
              <Text style={styles.storyTitle}>{story.title}</Text>
              <Feather name="arrow-up-right" size={17} color={t.color.bandMuted} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: {
    borderTopColor: t.color.bandMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: t.space[2],
    marginTop: t.space[5],
    paddingTop: t.space[4],
  },
  topRow: { alignItems: 'center', flexDirection: 'row', gap: t.space[3] },
  play: {
    alignItems: 'center',
    backgroundColor: t.color.accent,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  placeholder: {
    alignItems: 'center',
    borderColor: t.color.bandMuted,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  heading: { flex: 1, gap: t.space[1] },
  headingRow: { alignItems: 'center', flexDirection: 'row', gap: t.space[2] },
  titleGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.space[2],
  },
  title: {
    color: t.color.bandText,
    fontFamily: t.font.bold,
    fontSize: t.type.bodyLarge,
    flexShrink: 1,
  },
  beta: {
    borderColor: t.color.bandMuted,
    borderWidth: 1,
    color: t.color.bandText,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    paddingHorizontal: t.space[1],
  },
  subhead: {
    color: t.color.bandMuted,
    fontFamily: t.font.regular,
    fontSize: t.type.meta,
    lineHeight: 19,
  },
  // Negative margins keep the 44px tap target without pushing the subhead down,
  // so the gear centres on the title line.
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: -t.space[2],
    minHeight: t.size.tap,
    minWidth: t.size.tap,
  },
  steps: { flexDirection: 'row', gap: t.space[1], marginTop: t.space[2] },
  step: { flex: 1, gap: t.space[2] },
  stepBar: { borderColor: t.color.bandMuted, borderWidth: 1, height: 6 },
  stepBarDone: { backgroundColor: t.color.bandText, borderColor: t.color.bandText },
  stepBarActive: { backgroundColor: t.color.accent, borderColor: t.color.accent },
  stepLabel: {
    color: t.color.bandMuted,
    fontFamily: t.font.regular,
    fontSize: t.type.meta,
    paddingRight: t.space[2],
  },
  stepLabelActive: { color: t.color.bandText, fontFamily: t.font.bold },
  progressTrack: { backgroundColor: t.color.bandMuted, height: 4, marginTop: t.space[3] },
  progressFill: { backgroundColor: t.color.accent, height: '100%' },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: {
    color: t.color.bandMuted,
    fontFamily: t.font.medium,
    fontSize: t.type.meta,
    fontVariant: ['tabular-nums'],
  },
  controls: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: t.space[1] },
  smallControl: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: t.size.tap,
    minWidth: t.size.tap,
  },
  controlText: { color: t.color.bandText, fontFamily: t.font.bold, fontSize: t.type.meta },
  detailsButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: t.space[1],
    justifyContent: 'flex-end',
    minHeight: t.size.tap,
    flexGrow: 1,
  },
  preparation: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  prepareButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: t.color.accent,
    justifyContent: 'center',
    minHeight: t.size.tap,
    paddingHorizontal: t.space[4],
    marginTop: t.space[2],
  },
  prepareText: { color: t.color.accentContrast, fontFamily: t.font.bold, fontSize: t.type.body },
  inlineAction: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: t.size.tap },
  actionText: {
    color: t.color.bandText,
    fontFamily: t.font.semibold,
    fontSize: t.type.meta,
    textDecorationLine: 'underline',
  },
  disclaimer: { color: t.color.bandMuted, fontFamily: t.font.regular, fontSize: t.type.meta },
  details: {
    borderTopColor: t.color.bandMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: t.space[3],
    marginTop: t.space[2],
    paddingTop: t.space[4],
  },
  detailsHeading: { color: t.color.bandText, fontFamily: t.font.bold, fontSize: t.type.body },
  transcript: {
    color: t.color.bandText,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 24,
  },
  story: {
    alignItems: 'center',
    borderTopColor: t.color.bandMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: t.space[3],
    minHeight: t.size.tap,
    paddingVertical: t.space[2],
  },
  storyNumber: {
    color: t.color.bandMuted,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    fontVariant: ['tabular-nums'],
  },
  storyTitle: {
    color: t.color.bandText,
    flex: 1,
    fontFamily: t.font.semibold,
    fontSize: t.type.body,
    lineHeight: 22,
  },
  error: { color: t.color.bandText, fontFamily: t.font.medium, fontSize: t.type.meta },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
})
