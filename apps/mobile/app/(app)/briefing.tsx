import { nativeTokens as t } from '@dn/design-tokens/native'
import { feedbackMutation } from '@dn/queries'
import type { BriefingResponse } from '@dn/schemas'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Redirect } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { StoryCard } from '../../components/story-card'
import { Button, LoadingView, MessageView, Screen, uiStyles } from '../../components/ui'
import { api, isUnauthorized, queries } from '../../lib/api'

export default function BriefingScreen() {
  const briefing = useQuery({
    ...queries.briefing(),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  })
  if (briefing.isPending)
    return (
      <Screen>
        <LoadingView label="Loading briefing" />
      </Screen>
    )
  if (isUnauthorized(briefing.error)) return <Redirect href="/sign-in" />
  if (!briefing.data)
    return (
      <Screen>
        <MessageView
          title="Briefing unavailable"
          detail="Check your connection, then try again."
          action={{ label: 'Try again', onPress: briefing.refetch }}
        />
      </Screen>
    )
  const data = briefing.data
  return (
    <Screen>
      <ScrollView contentContainerStyle={uiStyles.content}>
        <Text style={uiStyles.eyebrow}>Your news desk</Text>
        <Text style={styles.heading}>Briefing</Text>
        <Text style={styles.text}>
          {data.since
            ? 'What changed since your last briefing.'
            : 'Your first briefing: a considered view of the news now.'}
        </Text>
        {!data.personalised ? (
          <Text style={styles.text}>
            Choose regions, desks and topics in Account to make this briefing yours.
          </Text>
        ) : null}
        {!data.sections.length ? (
          <Text style={styles.text}>No stories in the last three days yet.</Text>
        ) : null}
        {data.sections.map((section) => (
          <View key={section.kind} style={styles.section}>
            <Text style={uiStyles.label}>{section.title}</Text>
            <Text style={styles.text}>{section.description}</Text>
            {section.items.map((item) => (
              <BriefingCard key={item.story.id} item={item} now={data.openedAt} />
            ))}
          </View>
        ))}
      </ScrollView>
    </Screen>
  )
}
function BriefingCard({
  item,
  now,
}: {
  item: BriefingResponse['sections'][number]['items'][number]
  now: string
}) {
  const queryClient = useQueryClient()
  const save = useMutation(feedbackMutation(api, queryClient))
  const [feedback, setFeedback] = useState(item.feedback)
  const [hidden, setHidden] = useState(false)
  function update(signal: 'more' | 'less' | null) {
    const previous = feedback
    setFeedback(signal)
    setHidden(signal === 'less')
    save.mutate(
      { storyId: item.story.id, signal },
      {
        onError: () => {
          setFeedback(previous)
          setHidden(false)
        },
      },
    )
  }
  if (hidden)
    return (
      <View style={styles.card}>
        <Text style={styles.text}>Hidden from your Briefing: {item.story.title}</Text>
        <Button disabled={save.isPending} onPress={() => update(null)}>
          Undo
        </Button>
      </View>
    )
  return (
    <View style={styles.card}>
      <StoryCard story={item.story} now={now} />
      {item.update ? <Text style={styles.text}>{item.update.description}</Text> : null}
      <Text style={styles.text}>
        {item.reasons.length
          ? item.reasons.map((reason) => reason.label).join(' · ')
          : 'Included to keep your briefing broad.'}
      </Text>
      <View style={styles.actions}>
        <Button
          tone="light"
          disabled={save.isPending}
          accessibilityLabel={`More stories like ${item.story.title}`}
          onPress={() => update(feedback === 'more' ? null : 'more')}
        >
          {feedback === 'more' ? 'Undo more' : 'More'}
        </Button>
        <Button
          tone="light"
          disabled={save.isPending}
          accessibilityLabel={`Fewer stories like ${item.story.title}`}
          onPress={() => update('less')}
        >
          Less
        </Button>
      </View>
      {save.isError ? <Text style={styles.error}>Couldn’t save that. Try again.</Text> : null}
    </View>
  )
}
const styles = StyleSheet.create({
  heading: { color: t.color.text, fontFamily: t.font.black, fontSize: t.type.display },
  text: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 22,
  },
  section: { gap: t.space[4], marginTop: t.space[8] },
  card: { gap: t.space[2] },
  actions: { flexDirection: 'row', gap: t.space[2] },
  error: { color: t.color.error },
})
