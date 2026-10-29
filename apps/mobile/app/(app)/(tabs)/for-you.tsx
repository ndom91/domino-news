import { nativeTokens as t } from '@dn/design-tokens/native'
import { feedbackMutation } from '@dn/queries'
import type { ForYouReason, ForYouResponse } from '@dn/schemas'
import Feather from '@expo/vector-icons/Feather'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Redirect, useRouter } from 'expo-router'
import { useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { AudioBriefing } from '../../../components/audio-briefing'
import { StoryCard } from '../../../components/story-card'
import { Button, LoadingView, MessageView, Screen, uiStyles } from '../../../components/ui'
import { api, isUnauthorized, queries } from '../../../lib/api'

type FeedItem = ForYouResponse['items'][number]

export default function ForYouScreen() {
  const router = useRouter()
  const feed = useInfiniteQuery(queries.forYou())

  async function refresh() {
    await feed.refetch()
  }

  if (feed.isPending) {
    return (
      <Screen>
        <LoadingView label="Building your feed" />
      </Screen>
    )
  }
  if (isUnauthorized(feed.error)) return <Redirect href="/sign-in" />
  if (feed.isError && !feed.data) {
    return (
      <Screen>
        <MessageView
          action={{ label: 'Try again', onPress: refresh }}
          detail="Check your connection, then try again."
          title="For You is unavailable"
        />
      </Screen>
    )
  }

  const first = feed.data.pages[0]
  const items = feed.data.pages.flatMap((page) => page.items)
  const now = new Date().toISOString()
  let moreLabel = 'Show more stories'
  if (feed.isFetchNextPageError) moreLabel = 'Try again'
  if (feed.isFetchingNextPage) moreLabel = 'Loading…'

  return (
    <Screen>
      <FlatList
        contentContainerStyle={uiStyles.content}
        data={items}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(item) => item.story.id}
        ListEmptyComponent={
          <MessageView
            detail="Check back soon for newly reported stories."
            title="Nothing new yet"
          />
        }
        ListFooterComponent={
          feed.hasNextPage || feed.isFetchNextPageError ? (
            <View style={styles.more}>
              <Button disabled={feed.isFetchingNextPage} onPress={() => feed.fetchNextPage()}>
                {moreLabel}
              </Button>
              {feed.isFetchNextPageError ? (
                <Text accessibilityRole="alert" style={styles.pageError}>
                  Couldn’t load more stories. Try again.
                </Text>
              ) : null}
            </View>
          ) : undefined
        }
        ListHeaderComponent={
          <>
            <View style={styles.masthead}>
              <View style={styles.kickerMark} />
              <Text style={styles.eyebrow}>Your edition</Text>
              <Text style={styles.heading}>For You</Text>
              <Text style={styles.intro}>
                Ranked around the regions, desks and topics you pick. Wider news still appears.
              </Text>
              <AudioBriefing
                available={
                  first?.items.slice(0, 5).some(({ story }) => Boolean(story.summary?.trim())) ??
                  false
                }
              />
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push('/briefing')}
                style={({ pressed }) => [styles.briefingLink, pressed && styles.pressed]}
              >
                <Text style={styles.briefingLinkText}>Read your briefing</Text>
                <Feather name="arrow-right" size={16} color={t.color.bandText} />
              </Pressable>
            </View>
            {!first?.personalised ? (
              <View style={styles.setup}>
                <Text style={styles.setupTitle}>Make this feed yours</Text>
                <Text style={styles.setupText}>
                  Pick what matters to you and matching stories will move to the top.
                </Text>
                <Button onPress={() => router.push('/account')}>Choose your picks</Button>
              </View>
            ) : null}
          </>
        }
        ListHeaderComponentStyle={items.length ? styles.listHeader : undefined}
        refreshControl={
          <RefreshControl
            onRefresh={refresh}
            refreshing={feed.isRefetching}
            tintColor={t.color.accentText}
          />
        }
        renderItem={({ item }) => <ForYouCard item={item} now={now} />}
      />
    </Screen>
  )
}

function ForYouCard({ item, now }: { item: FeedItem; now: string }) {
  const queryClient = useQueryClient()
  const feedback = useMutation(feedbackMutation(api, queryClient))
  const [signal, setSignal] = useState(item.feedback)
  const [hidden, setHidden] = useState(false)

  function update(next: 'more' | 'less' | null) {
    const previous = signal
    setSignal(next)
    feedback.mutate(
      { signal: next, storyId: item.story.id },
      {
        onError: () => {
          setSignal(previous)
          setHidden(false)
        },
      },
    )
  }

  if (hidden) {
    return (
      <View accessibilityRole="alert" style={styles.hiddenCard}>
        <View style={styles.hiddenHeading}>
          <Feather color={t.color.accentText} name="eye-off" size={20} />
          <Text style={styles.hiddenTitle}>Hidden from For You</Text>
        </View>
        <Text numberOfLines={2} style={styles.hiddenStory}>
          {item.story.title}
        </Text>
        <Button disabled={feedback.isPending} onPress={() => update(null)} tone="light">
          Undo
        </Button>
      </View>
    )
  }

  return (
    <View style={styles.card}>
      <StoryCard now={now} story={item.story} />
      <View style={styles.why}>
        <Text style={styles.whyTitle}>Why you’re seeing this</Text>
        <Text style={styles.whyText}>{reasonText(item.reasons)}</Text>
      </View>
      <View style={styles.feedback}>
        <Pressable
          accessibilityLabel="More like this"
          accessibilityRole="button"
          accessibilityState={{ disabled: feedback.isPending, selected: signal === 'more' }}
          disabled={feedback.isPending}
          onPress={() => update(signal === 'more' ? null : 'more')}
          style={({ pressed }) => [
            styles.feedbackButton,
            signal === 'more' ? styles.feedbackButtonSelected : null,
            pressed ? styles.pressed : null,
          ]}
        >
          <Feather color={t.color.text} name="thumbs-up" size={18} />
        </Pressable>
        <Pressable
          accessibilityLabel="Less like this"
          accessibilityRole="button"
          accessibilityState={{ disabled: feedback.isPending }}
          disabled={feedback.isPending}
          onPress={() => {
            setHidden(true)
            update('less')
          }}
          style={({ pressed }) => [styles.feedbackButton, pressed ? styles.pressed : null]}
        >
          <Feather color={t.color.text} name="thumbs-down" size={18} />
        </Pressable>
      </View>
      {feedback.isError ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          Couldn’t save that. Try again.
        </Text>
      ) : null}
    </View>
  )
}

function reasonText(reasons: ForYouReason[]): string {
  if (reasons.length === 0) return 'One of the most widely covered stories right now.'
  return reasons
    .slice(0, 2)
    .map((reason) => {
      switch (reason.kind) {
        case 'narrative':
          return `You follow ${reason.label}`
        case 'publisher':
          return `From ${reason.label}, which you follow`
        case 'topic':
          return `Topic you picked: ${reason.label}`
        case 'region':
          return `Region you picked: ${reason.label}`
        case 'desk':
          return `Desk you picked: ${reason.label}`
        case 'learned':
          return `You asked for more ${reason.label}`
        default:
          return reason.label
      }
    })
    .join(' · ')
}

const styles = StyleSheet.create({
  masthead: {
    backgroundColor: t.color.band,
    gap: t.space[2],
    margin: -t.space[4],
    padding: t.space[5],
  },
  kickerMark: { backgroundColor: t.color.accent, height: 6, width: 52 },
  eyebrow: {
    color: t.color.bandMuted,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    letterSpacing: 1,
    marginTop: t.space[3],
    textTransform: 'uppercase',
  },
  heading: { color: t.color.bandText, fontFamily: t.font.black, fontSize: 42, letterSpacing: -1.5 },
  intro: {
    color: t.color.bandText,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
    maxWidth: 320,
  },
  briefingLink: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: t.space[2],
    minHeight: t.size.tap,
  },
  briefingLinkText: {
    color: t.color.bandText,
    fontFamily: t.font.semibold,
    fontSize: t.type.meta,
    textDecorationLine: 'underline',
  },
  setup: {
    backgroundColor: t.color.warningSubtle,
    gap: t.space[3],
    marginTop: t.space[6],
    padding: t.space[4],
  },
  setupTitle: { color: t.color.text, fontFamily: t.font.black, fontSize: t.type.headline },
  setupText: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
  },
  listHeader: { marginBottom: t.space[6] },
  separator: { height: t.space[6] },
  card: { gap: t.space[2] },
  why: {
    borderLeftColor: t.color.accent,
    borderLeftWidth: 3,
    gap: t.space[1],
    marginLeft: t.space[3],
    paddingLeft: t.space[3],
  },
  whyTitle: {
    color: t.color.textMuted,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    textTransform: 'uppercase',
  },
  whyText: {
    color: t.color.textSecondary,
    fontFamily: t.font.medium,
    fontSize: t.type.meta,
    lineHeight: 18,
  },
  feedback: { flexDirection: 'row', gap: t.space[2], justifyContent: 'flex-end' },
  feedbackButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: t.size.tap,
    minWidth: t.size.tap,
  },
  feedbackButtonSelected: { backgroundColor: t.color.successSubtle },
  hiddenCard: { backgroundColor: t.color.sunken, gap: t.space[3], padding: t.space[4] },
  hiddenHeading: { alignItems: 'center', flexDirection: 'row', gap: t.space[2] },
  hiddenTitle: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
  hiddenStory: { color: t.color.textSecondary, fontFamily: t.font.regular, fontSize: t.type.meta },
  error: { color: t.color.error, fontFamily: t.font.medium, fontSize: t.type.meta },
  pressed: { opacity: 0.65 },
  more: { marginTop: t.space[8] },
  pageError: { color: t.color.error, fontFamily: t.font.medium, fontSize: t.type.meta },
})
