import { nativeTokens as t } from '@dn/design-tokens/native'
import { plural } from '@dn/domain'
import type { StoryLead } from '@dn/schemas'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Redirect, useRouter } from 'expo-router'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { StoryCard } from '../../../components/story-card'
import { Button, LoadingView, MessageView, Screen, uiStyles } from '../../../components/ui'
import { isUnauthorized, queries } from '../../../lib/api'

export default function LatestScreen() {
  const front = useQuery(queries.front())
  const stories = useInfiniteQuery(queries.storyList())

  async function refresh() {
    await Promise.all([front.refetch(), stories.refetch()])
  }

  if (front.isPending || stories.isPending) {
    return (
      <Screen>
        <LoadingView label="Loading stories" />
      </Screen>
    )
  }
  if (isUnauthorized(front.error) || isUnauthorized(stories.error)) {
    return <Redirect href="/sign-in" />
  }
  if (front.isError || stories.isError) {
    return (
      <Screen>
        <MessageView
          detail="Check your connection, then try again."
          title="Stories are unavailable"
          action={{ label: 'Try again', onPress: refresh }}
        />
      </Screen>
    )
  }

  const now = front.data.editionAt
  const latest = stories.data.pages
    .flatMap((page) => page.items)
    .filter((story) => story.id !== front.data.lead?.id)

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={uiStyles.content}
        refreshControl={
          <RefreshControl
            onRefresh={refresh}
            refreshing={front.isRefetching || stories.isRefetching}
            tintColor={t.color.accentText}
          />
        }
      >
        <View style={styles.edition}>
          <Text style={styles.brand}>
            DOMINO<Text style={styles.dot}>.</Text>
          </Text>
          <Text style={styles.editionText}>
            {plural(front.data.stats.stories, 'story')} in the last 24 hours
          </Text>
        </View>
        {front.data.lead ? (
          <View style={styles.lead}>
            <Text style={uiStyles.eyebrow}>Lead story</Text>
            <LeadStory story={front.data.lead} />
          </View>
        ) : null}
        <View style={styles.latestHeader}>
          <Text style={styles.section}>Latest</Text>
          <Text accessibilityLiveRegion="polite" style={styles.count}>
            {plural(latest.length, 'story', 'stories')}
          </Text>
        </View>
        {latest.length === 0 ? (
          <MessageView
            detail="New stories usually arrive within 15 minutes."
            title="No stories yet"
          />
        ) : (
          <View style={styles.list}>
            {latest.map((story) => (
              <StoryCard key={story.id} now={now} story={story} />
            ))}
          </View>
        )}
        {stories.hasNextPage ? (
          <View style={styles.more}>
            <Button disabled={stories.isFetchingNextPage} onPress={() => stories.fetchNextPage()}>
              {stories.isFetchingNextPage ? 'Loading…' : 'Show older stories'}
            </Button>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  )
}

function LeadStory({ story }: { story: StoryLead }) {
  const router = useRouter()
  return (
    <Pressable
      accessibilityHint="Opens this story"
      accessibilityLabel={story.title}
      accessibilityRole="link"
      onPress={() => router.push(`/stories/${story.slug}`)}
      style={({ pressed }) => [styles.leadStory, pressed ? styles.pressed : null]}
    >
      <Text style={styles.leadTitle}>{story.title}</Text>
      {story.summary ? (
        <Text numberOfLines={5} style={styles.leadSummary}>
          {story.summary.body}
        </Text>
      ) : null}
      <Text style={styles.leadMeta}>{plural(story.sources.length, 'report')}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  edition: {
    borderBottomColor: t.color.rule,
    borderBottomWidth: 2,
    gap: t.space[2],
    paddingBottom: t.space[4],
  },
  brand: { color: t.color.text, fontFamily: t.font.black, fontSize: 36, letterSpacing: -1.5 },
  dot: { color: t.color.accent },
  editionText: { color: t.color.textMuted, fontFamily: t.font.medium, fontSize: t.type.meta },
  lead: { gap: t.space[3], marginTop: t.space[6] },
  leadStory: {
    backgroundColor: t.color.surface,
    borderColor: t.color.rule,
    borderWidth: 2,
    gap: t.space[3],
    padding: t.space[4],
  },
  leadTitle: {
    color: t.color.text,
    fontFamily: t.font.black,
    fontSize: 30,
    letterSpacing: -0.6,
    lineHeight: 31,
  },
  leadSummary: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.bodyLarge,
    lineHeight: 25,
  },
  leadMeta: { color: t.color.textMuted, fontFamily: t.font.bold, fontSize: t.type.meta },
  pressed: { opacity: 0.7 },
  latestHeader: {
    alignItems: 'baseline',
    borderBottomColor: t.color.rule,
    borderBottomWidth: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: t.space[10],
    paddingBottom: t.space[2],
  },
  section: {
    color: t.color.text,
    fontFamily: t.font.black,
    fontSize: t.type.section,
    textTransform: 'uppercase',
  },
  count: { color: t.color.textMuted, fontFamily: t.font.medium, fontSize: t.type.meta },
  list: { gap: t.space[3], marginTop: t.space[4] },
  more: { marginTop: t.space[6] },
})
