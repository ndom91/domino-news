import { nativeTokens as t } from '@dn/design-tokens/native'
import { regionForCountry } from '@dn/domain'
import { savePreferencesMutation, setFollowMutation } from '@dn/queries'
import { REGION_LABELS, REGIONS, type Region } from '@dn/schemas'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Redirect, useRouter } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { ChipPicker, FeedPicks } from '../../components/feed-picks'
import { Button, LoadingView, MessageView, Screen, uiStyles } from '../../components/ui'
import { api, isUnauthorized, queries } from '../../lib/api'

const STEPS = [
  {
    title: 'Where do you follow the news?',
    text: 'Stories about these regions lead your front page and rank higher in For You.',
  },
  {
    title: 'What do you want more of?',
    text: 'Pick broad desks, specific topics, or both. You can change these any time on your account page.',
  },
  {
    title: 'Follow a few publishers',
    text: 'Stories they cover rank higher in For You. Nothing else is hidden.',
  },
] as const

/** First-run setup: every step is optional and each selection saves as it is made. */
export default function OnboardingScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const preferences = useQuery(queries.preferences())
  const save = useMutation(savePreferencesMutation(api, queryClient))
  const [step, setStep] = useState(0)

  if (preferences.isPending) {
    return (
      <Screen top>
        <LoadingView label="Preparing onboarding" />
      </Screen>
    )
  }
  if (isUnauthorized(preferences.error)) return <Redirect href="/sign-in" />
  if (preferences.isError) {
    return (
      <Screen top>
        <MessageView
          action={{ label: 'Try again', onPress: preferences.refetch }}
          detail="Check your connection, then try again."
          title="Onboarding is unavailable"
        />
      </Screen>
    )
  }

  const current = STEPS[step] ?? STEPS[0]
  const last = step === STEPS.length - 1

  function finish() {
    save.mutate({ onboarded: true }, { onSuccess: () => router.replace('/for-you') })
  }

  return (
    <Screen top>
      <ScrollView contentContainerStyle={uiStyles.content}>
        <View style={styles.masthead}>
          <Text style={styles.step}>
            Step {step + 1} of {STEPS.length}
          </Text>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.intro}>{current.text}</Text>
        </View>

        <View style={styles.picker}>
          {step === 0 ? (
            <FeedPicks
              disabled={save.isPending}
              onChange={(update) => save.mutate(update)}
              sections={['regions']}
              values={preferences.data}
            />
          ) : null}
          {step === 1 ? (
            <FeedPicks
              disabled={save.isPending}
              onChange={(update) => save.mutate(update)}
              sections={['desks', 'topics']}
              values={preferences.data}
            />
          ) : null}
          {step === 2 ? <PublisherPicker /> : null}
        </View>

        {save.isError ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            Your choices could not be saved. Try again.
          </Text>
        ) : null}

        <View style={styles.actions}>
          {step > 0 ? (
            <Button disabled={save.isPending} onPress={() => setStep(step - 1)} tone="light">
              Back
            </Button>
          ) : null}
          {last ? (
            <Button disabled={save.isPending} onPress={finish}>
              Show my feed
            </Button>
          ) : (
            <Button disabled={save.isPending} onPress={() => setStep(step + 1)}>
              Next
            </Button>
          )}
          <Button disabled={save.isPending} onPress={finish} tone="light">
            Skip for now
          </Button>
        </View>
      </ScrollView>
    </Screen>
  )
}

/** Newsroom publishers, grouped by their home region. Official sources are not followable here. */
function PublisherPicker() {
  const queryClient = useQueryClient()
  const publishers = useQuery(queries.publishers())
  const follows = useQuery(queries.follows())
  const save = useMutation(setFollowMutation(api, queryClient))

  if (publishers.isPending || follows.isPending) return <LoadingView label="Loading publishers" />
  if (publishers.isError || follows.isError) {
    return (
      <MessageView
        detail="You can follow publishers later from their pages."
        title="Publishers could not be loaded"
      />
    )
  }

  const followed = new Set(
    follows.data.items
      .filter((follow) => follow.targetType === 'publisher')
      .map((follow) => follow.id),
  )
  const newsrooms = publishers.data.items
    .filter((publisher) => publisher.kind === 'newsroom')
    .toSorted((a, b) => a.name.localeCompare(b.name))
  const groups = [...REGIONS.filter((region) => region !== 'global'), 'global' as const]
    .map((region) => ({
      region,
      publishers: newsrooms.filter(
        (publisher) => (regionForCountry(publisher.countryCode) ?? 'global') === region,
      ),
    }))
    .filter((group) => group.publishers.length > 0)

  return (
    <View style={styles.publisherGroups}>
      {groups.map(({ region, publishers: groupedPublishers }) => (
        <ChipPicker
          disabled={save.isPending}
          key={region}
          label={region === 'global' ? 'International' : REGION_LABELS[region as Region]}
          onToggle={(id) =>
            save.mutate({ targetType: 'publisher', targetId: id, follow: !followed.has(id) })
          }
          options={groupedPublishers.map((publisher) => publisher.id)}
          selected={[...followed]}
          titleFor={(id) => groupedPublishers.find((publisher) => publisher.id === id)?.name ?? id}
        />
      ))}
      {save.isError ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          Your follows could not be saved. Try again.
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  masthead: {
    backgroundColor: t.color.band,
    gap: t.space[3],
    margin: -t.space[4],
    padding: t.space[5],
  },
  step: {
    color: t.color.bandMuted,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: { color: t.color.bandText, fontFamily: t.font.black, fontSize: 36, letterSpacing: -1.2 },
  intro: {
    color: t.color.bandText,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
  },
  picker: { marginTop: t.space[8] },
  publisherGroups: { gap: t.space[5] },
  actions: {
    borderTopColor: t.color.rule,
    borderTopWidth: 2,
    gap: t.space[3],
    marginTop: t.space[10],
    paddingTop: t.space[5],
  },
  error: {
    color: t.color.error,
    fontFamily: t.font.medium,
    fontSize: t.type.body,
    marginTop: t.space[4],
  },
})
