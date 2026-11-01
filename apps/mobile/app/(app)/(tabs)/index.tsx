import { nativeTokens as t } from '@dn/design-tokens/native'
import { plural, stripCitations } from '@dn/domain'
import { DESK_LABELS, DESK_SLOT, type StoryLead } from '@dn/schemas'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Redirect, useRouter } from 'expo-router'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { StoryCard } from '../../../components/story-card'
import { Button, LoadingView, MessageView, Screen, uiStyles } from '../../../components/ui'
import { isUnauthorized, queries } from '../../../lib/api'

export default function LatestScreen() {
  const router = useRouter()
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
  if ((front.isError && !front.data) || (stories.isError && !stories.data)) {
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
  let moreLabel = 'Show older stories'
  if (stories.isFetchNextPageError) moreLabel = 'Try again'
  if (stories.isFetchingNextPage) moreLabel = 'Loading…'

  return (
    <Screen>
      <FlatList
        contentContainerStyle={uiStyles.content}
        data={latest}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(story) => story.id}
        ListEmptyComponent={
          <MessageView
            detail="New stories usually arrive within 15 minutes."
            title="No stories yet"
          />
        }
        ListFooterComponent={
          stories.hasNextPage || stories.isFetchNextPageError ? (
            <View style={styles.more}>
              <Button disabled={stories.isFetchingNextPage} onPress={() => stories.fetchNextPage()}>
                {moreLabel}
              </Button>
              {stories.isFetchNextPageError ? (
                <Text accessibilityRole="alert" style={styles.pageError}>
                  Couldn’t load older stories. Try again.
                </Text>
              ) : null}
            </View>
          ) : undefined
        }
        ListHeaderComponent={
          <>
            <View style={styles.edition}>
              <Text style={styles.editionLabel}>The latest reporting</Text>
              <Text style={styles.editionText}>
                {plural(front.data.stats.stories, 'story', 'stories')} in the last 24 hours
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
            {/* Spaced off the header's rule so the two borders don't read as one thick line. */}
            <View style={styles.browse}>
              <Button tone="light" onPress={() => router.push('/narratives')}>
                Browse narratives
              </Button>
            </View>
          </>
        }
        ListHeaderComponentStyle={latest.length ? styles.listHeader : undefined}
        refreshControl={
          <RefreshControl
            onRefresh={refresh}
            refreshing={front.isRefetching || stories.isRefetching}
            tintColor={t.color.accentText}
          />
        }
        renderItem={({ item }) => <StoryCard now={now} story={item} />}
      />
    </Screen>
  )
}

function LeadStory({ story }: { story: StoryLead }) {
  const router = useRouter()
  // The same desk fill as the web hero and the story cards' bars.
  const slot = story.desk ? DESK_SLOT[story.desk] : 0
  const fill = t.color.narrative[slot] ?? t.color.narrative[0]
  const ink = t.color.narrativeText[slot] ?? t.color.narrativeText[0]
  const narrative = story.narratives[0]
  return (
    <Pressable
      accessibilityHint="Opens this story"
      accessibilityLabel={story.title}
      accessibilityRole="link"
      onPress={() => router.push(`/stories/${story.slug}`)}
      style={({ pressed }) => [
        styles.leadStory,
        { backgroundColor: fill },
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={[styles.leadKicker, { borderBottomColor: ink }]}>
        <Text numberOfLines={1} style={[styles.leadLabel, { color: ink }]}>
          {narrative?.title ?? (story.desk ? DESK_LABELS[story.desk] : 'Story')}
        </Text>
        <Text style={[styles.leadMeta, { color: ink }]}>Most reported today</Text>
      </View>
      <Text style={[styles.leadTitle, { color: ink }]}>{story.title}</Text>
      {story.summary ? (
        <Text numberOfLines={5} style={[styles.leadSummary, { color: ink }]}>
          {stripCitations(story.summary.body).replace(/\s+([.,;:])/g, '$1')}
        </Text>
      ) : null}
      <Text style={[styles.leadMeta, { color: ink }]}>
        {plural(story.sources.length, 'report')}
      </Text>
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
  editionLabel: { color: t.color.text, fontFamily: t.font.black, fontSize: t.type.headline },
  editionText: { color: t.color.textMuted, fontFamily: t.font.medium, fontSize: t.type.meta },
  lead: { gap: t.space[3], marginTop: t.space[6] },
  leadStory: { gap: t.space[3], padding: t.space[4] },
  leadKicker: { borderBottomWidth: 2, gap: t.space[1], paddingBottom: t.space[2] },
  leadLabel: {
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  leadTitle: {
    fontFamily: t.font.black,
    fontSize: 30,
    letterSpacing: -0.6,
    lineHeight: 31,
  },
  leadSummary: {
    fontFamily: t.font.regular,
    fontSize: t.type.bodyLarge,
    lineHeight: 25,
  },
  leadMeta: { fontFamily: t.font.bold, fontSize: t.type.meta },
  browse: { marginTop: t.space[3] },
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
  listHeader: { marginBottom: t.space[4] },
  separator: { height: t.space[3] },
  more: { marginTop: t.space[6] },
  pageError: { color: t.color.error, fontFamily: t.font.medium, fontSize: t.type.meta },
})
