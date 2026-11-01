import { nativeTokens as t } from '@dn/design-tokens/native'
import { feedbackMutation, updateSignalsMutation } from '@dn/queries'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ConfirmationDialog } from '../../../../components/account/confirmation-dialog'
import {
  SectionHeading,
  SettingsPage,
  settingsStyles as s,
} from '../../../../components/account/settings'
import { StoryCard } from '../../../../components/story-card'
import { Button } from '../../../../components/ui'
import { api, queries } from '../../../../lib/api'

export default function LearnedSignalsScreen() {
  const queryClient = useQueryClient()
  const signals = useQuery(queries.signals())
  const hiddenStories = useQuery(queries.hiddenStories())
  const signalSave = useMutation(updateSignalsMutation(api, queryClient))
  const feedbackSave = useMutation(feedbackMutation(api, queryClient))
  const [confirmReset, setConfirmReset] = useState(false)
  return (
    <>
      <SettingsPage>
        <View style={s.section}>
          <SectionHeading>Signals</SectionHeading>
          <Text style={s.description}>
            “More” and “Less” adjust these signals. You can remove a signal or start over.
          </Text>
          {signals.isPending ? <Text style={s.note}>Loading learned signals…</Text> : null}
          {signals.isError ? (
            <Text style={s.error}>Your learned signals could not be loaded.</Text>
          ) : null}
          {signals.data?.items.length === 0 ? (
            <Text style={s.note}>Use “More” or “Less” in For You to teach the feed.</Text>
          ) : null}
          {signals.data?.items.map((signal) => (
            <View key={`${signal.kind}-${signal.key}`} style={styles.row}>
              <View style={styles.text}>
                <Text style={styles.label}>{signal.label}</Text>
                <Text style={styles.detail}>
                  {signal.kind} · {signal.weight > 0 ? 'More like this' : 'Less like this'}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={`Remove learned signal for ${signal.label}`}
                accessibilityRole="button"
                disabled={signalSave.isPending}
                onPress={() =>
                  signalSave.mutate({ remove: { key: signal.key, kind: signal.kind } })
                }
                style={({ pressed }) => [
                  styles.action,
                  signalSave.isPending ? s.disabled : null,
                  pressed ? s.pressed : null,
                ]}
              >
                <Text style={styles.actionText}>Remove</Text>
              </Pressable>
            </View>
          ))}
          {signals.data && signals.data.items.length > 0 ? (
            <Button
              disabled={signalSave.isPending}
              onPress={() => setConfirmReset(true)}
              tone="light"
            >
              Reset learned signals
            </Button>
          ) : null}
          {signalSave.isError ? (
            <Text accessibilityLiveRegion="polite" style={s.error}>
              Your learned signals could not be updated. Try again.
            </Text>
          ) : null}
        </View>

        <View style={s.section}>
          <SectionHeading>Hidden from For You</SectionHeading>
          {hiddenStories.isPending ? <Text style={s.note}>Loading hidden stories…</Text> : null}
          {hiddenStories.isError ? (
            <Text style={s.error}>Hidden stories could not be loaded.</Text>
          ) : null}
          {hiddenStories.data?.items.length === 0 ? (
            <Text style={s.note}>No stories are hidden.</Text>
          ) : null}
          {hiddenStories.data?.items.map((story) => (
            <View key={story.id} style={styles.hiddenStory}>
              <StoryCard now={new Date().toISOString()} story={story} />
              <Button
                disabled={feedbackSave.isPending}
                onPress={() => feedbackSave.mutate({ storyId: story.id, signal: null })}
                tone="light"
              >
                Show in For You
              </Button>
            </View>
          ))}
          {feedbackSave.isError ? (
            <Text accessibilityLiveRegion="polite" style={s.error}>
              That story could not be restored. Try again.
            </Text>
          ) : null}
        </View>
      </SettingsPage>
      <ConfirmationDialog
        cancelLabel="Keep signals"
        confirmLabel="Reset signals"
        detail="This removes all feedback learned from your “More” and “Less” choices and restores any stories hidden by “Less”."
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          signalSave.mutate({ reset: true })
          setConfirmReset(false)
        }}
        pending={signalSave.isPending}
        title="Reset learned signals?"
        visible={confirmReset}
      />
    </>
  )
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: t.space[3],
    minHeight: t.size.tap,
  },
  text: { flex: 1, paddingVertical: t.space[2] },
  label: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
  detail: { color: t.color.textMuted, fontFamily: t.font.regular, fontSize: t.type.meta },
  action: { justifyContent: 'center', minHeight: t.size.tap, paddingHorizontal: t.space[2] },
  actionText: { color: t.color.accentText, fontFamily: t.font.bold, fontSize: t.type.meta },
  hiddenStory: { gap: t.space[2] },
})
