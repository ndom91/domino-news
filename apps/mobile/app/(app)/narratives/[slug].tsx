import { nativeTokens as t } from '@dn/design-tokens/native'
import { formatDate, layoutNarrative, plural, relationLabel } from '@dn/domain'
import { DESK_LABELS, type NarrativeDetail } from '@dn/schemas'
import { useQuery } from '@tanstack/react-query'
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { FollowToggle } from '../../../components/follow-toggle'
import { StoryUpdates } from '../../../components/story-detail/story-updates'
import {
  Button,
  deskColors,
  MessageView,
  QueryScreen,
  Screen,
  uiStyles,
} from '../../../components/ui'
import { queries } from '../../../lib/api'

export default function NarrativeScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const narrative = useQuery(queries.narrative(slug))
  const updates = useQuery(queries.narrativeUpdates(slug))

  return (
    <QueryScreen
      detail="This narrative may no longer be available."
      loading="Loading narrative"
      query={narrative}
      title="Narrative unavailable"
    >
      {(data) => (
        <NarrativeContent
          narrative={data}
          updates={updates.data?.items ?? []}
          retryUpdates={updates.isError ? () => void updates.refetch() : undefined}
        />
      )}
    </QueryScreen>
  )
}

function NarrativeContent({
  narrative,
  updates,
  retryUpdates,
}: {
  narrative: NarrativeDetail
  updates: Parameters<typeof StoryUpdates>[0]['items']
  retryUpdates?: () => void
}) {
  const router = useRouter()
  const [lastMarkerCenter, setLastMarkerCenter] = useState<number | null>(null)
  // Oldest first, each with the earlier story it most directly continues, as on the web.
  const { rows } = layoutNarrative(narrative.stories, narrative.edges)
  const stories = rows.map((row) => row.node)
  const first = stories[0]
  const last = stories.at(-1)
  const { fill, ink } = deskColors(narrative.desk)
  const titleOf = new Map(stories.map((story) => [story.id, story.title]))

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Narrative' }} />
      <ScrollView contentContainerStyle={uiStyles.content}>
        <View style={[styles.deskBar, { backgroundColor: fill }]}>
          <Text style={[styles.deskBarText, { color: ink }]}>
            {narrative.desk ? DESK_LABELS[narrative.desk] : 'Narrative'}
          </Text>
        </View>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{narrative.title}</Text>
          <FollowToggle name={narrative.title} targetId={narrative.id} targetType="narrative" />
        </View>
        <StoryUpdates title="Recent updates" items={updates} />
        {retryUpdates ? (
          <Button tone="light" onPress={retryUpdates}>
            Retry recent updates
          </Button>
        ) : null}
        {narrative.description ? (
          <Text style={styles.description}>{narrative.description}</Text>
        ) : null}
        <Text style={styles.meta}>
          {plural(stories.length, 'story', 'stories')}
          {first && last
            ? ` · ${formatDate(first.firstObservedAt)} to ${formatDate(last.firstObservedAt)}`
            : ''}
        </Text>

        <View style={styles.timeline}>
          <Text style={uiStyles.label}>Timeline</Text>
          {stories.length === 0 ? (
            <MessageView
              detail="Stories will appear here when this narrative is updated."
              title="No stories yet"
            />
          ) : (
            <View style={styles.timelineItems}>
              {lastMarkerCenter ? (
                <View
                  pointerEvents="none"
                  style={[styles.rail, { height: lastMarkerCenter - markerCenter }]}
                />
              ) : null}
              {rows.map(({ node: story, primary }, index) => {
                const parentTitle = primary ? titleOf.get(primary.parentId) : undefined
                return (
                  <View
                    key={story.id}
                    onLayout={
                      index === stories.length - 1
                        ? (event) => setLastMarkerCenter(event.nativeEvent.layout.y + markerCenter)
                        : undefined
                    }
                    style={
                      index === stories.length - 1 ? styles.timelineItemLast : styles.timelineItem
                    }
                  >
                    <View style={styles.markerColumn}>
                      <View style={styles.marker} />
                    </View>
                    <Pressable
                      accessibilityHint="Opens this story"
                      accessibilityLabel={story.title}
                      accessibilityRole="link"
                      onPress={() => router.push(`/stories/${story.slug}`)}
                      style={({ pressed }) => [styles.story, pressed ? styles.pressed : null]}
                    >
                      <Text style={styles.storyDate}>{formatDate(story.firstObservedAt)}</Text>
                      <Text style={styles.storyTitle}>{story.title}</Text>
                      {story.summary ? (
                        <Text numberOfLines={3} style={styles.storySummary}>
                          {story.summary}
                        </Text>
                      ) : null}
                      <Text style={styles.storyMeta}>{plural(story.sourceCount, 'report')}</Text>
                      {primary && parentTitle ? (
                        <Text style={styles.relation}>
                          {relationLabel(primary.relation)}: {parentTitle}
                        </Text>
                      ) : null}
                    </Pressable>
                  </View>
                )
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  )
}

const markerCenter = t.space[4] + 7

const styles = StyleSheet.create({
  deskBar: {
    marginBottom: t.space[4],
    minHeight: 30,
    paddingHorizontal: t.space[3],
    justifyContent: 'center',
  },
  deskBarText: {
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  titleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: t.space[3] },
  title: {
    color: t.color.text,
    flex: 1,
    fontFamily: t.font.black,
    fontSize: 34,
    letterSpacing: -0.8,
    lineHeight: 35,
  },
  description: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.bodyLarge,
    lineHeight: 25,
    marginTop: t.space[3],
  },
  meta: {
    color: t.color.textMuted,
    fontFamily: t.font.medium,
    fontSize: t.type.meta,
    marginTop: t.space[4],
  },
  timeline: { gap: t.space[4], marginTop: t.space[10] },
  timelineItems: { gap: 0, position: 'relative' },
  timelineItem: { flexDirection: 'row', minHeight: 116, paddingBottom: t.space[4] },
  timelineItemLast: { flexDirection: 'row', minHeight: 116 },
  markerColumn: { alignItems: 'center', width: 24 },
  marker: {
    backgroundColor: t.color.accent,
    borderColor: t.color.canvas,
    borderRadius: 7,
    borderWidth: 3,
    height: 14,
    marginTop: t.space[4],
    width: 14,
    zIndex: 1,
  },
  rail: {
    backgroundColor: t.color.borderStrong,
    left: 11,
    position: 'absolute',
    top: markerCenter,
    width: 2,
  },
  story: {
    backgroundColor: t.color.surface,
    borderColor: t.color.border,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    gap: t.space[2],
    padding: t.space[4],
  },
  storyDate: { color: t.color.accentText, fontFamily: t.font.bold, fontSize: t.type.meta },
  storyTitle: { color: t.color.text, fontFamily: t.font.black, fontSize: 22, lineHeight: 24 },
  storySummary: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 22,
  },
  storyMeta: { color: t.color.textMuted, fontFamily: t.font.medium, fontSize: t.type.meta },
  relation: {
    borderTopColor: t.color.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    color: t.color.textSecondary,
    fontFamily: t.font.medium,
    fontSize: t.type.meta,
    lineHeight: 18,
    marginTop: t.space[1],
    paddingTop: t.space[2],
  },
  pressed: { opacity: 0.7 },
})
