import { nativeTokens as t } from '@dn/design-tokens/native'
import { plural, stripCitations } from '@dn/domain'
import { DESK_LABELS, type StoryLead } from '@dn/schemas'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { StoryCard } from '../../../components/story-card'
import {
  Button,
  deskColors,
  LoadMoreFooter,
  MessageView,
  QueryScreen,
  Screen,
  uiStyles,
} from '../../../components/ui'
import { queries } from '../../../lib/api'

export default function LatestScreen() {
  const router = useRouter()
  const front = useQuery(queries.front())
  const stories = useInfiniteQuery(queries.storyList())

  async function refresh() {
    await Promise.all([front.refetch(), stories.refetch()])
  }

  return (
    <QueryScreen loading="Loading stories" query={front} title="Stories are unavailable">
      {(frontPage) => (
        <QueryScreen loading="Loading stories" query={stories} title="Stories are unavailable">
          {({ pages }) => {
            const latest = pages
              .flatMap((page) => page.items)
              .filter((story) => story.id !== frontPage.lead?.id)
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
                    <LoadMoreFooter label="Show older stories" query={stories} />
                  }
                  ListHeaderComponent={
                    <>
                      <View style={styles.edition}>
                        <Text style={styles.editionLabel}>The latest reporting</Text>
                        <Text style={styles.editionText}>
                          {plural(frontPage.stats.stories, 'story', 'stories')} in the last 24 hours
                        </Text>
                      </View>
                      {frontPage.lead ? (
                        <View style={styles.lead}>
                          <Text style={uiStyles.eyebrow}>Lead story</Text>
                          <LeadStory story={frontPage.lead} />
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
                  renderItem={({ item }) => <StoryCard now={frontPage.editionAt} story={item} />}
                />
              </Screen>
            )
          }}
        </QueryScreen>
      )}
    </QueryScreen>
  )
}

function LeadStory({ story }: { story: StoryLead }) {
  const router = useRouter()
  // The same desk fill as the web hero and the story cards' bars.
  const { fill, ink } = deskColors(story.desk)
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
})
