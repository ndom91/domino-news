import { nativeTokens as t } from '@dn/design-tokens/native'
import { plural, shortRelative, stripCitations } from '@dn/domain'
import { DESK_LABELS, type Desk, type StoryListItem } from '@dn/schemas'
import { useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { deskColors } from './ui'

/**
 * `now` is when the list was fetched (its query's dataUpdatedAt). Don't pass `new Date()` from
 * render: the React Compiler caches it for the screen's whole life.
 */
export function StoryCard({ story, now }: { story: StoryListItem; now: string }) {
  const router = useRouter()
  const publishers = story.publishers
    .slice(0, 3)
    .map((publisher) => publisher.name)
    .join(' · ')

  return (
    <DeskCard
      desk={story.desk}
      kind="story"
      onPress={() => router.push(`/stories/${story.slug}`)}
      title={story.title}
    >
      <Text style={cardStyles.meta}>
        {shortRelative(story.lastUpdatedAt, new Date(now))} · {plural(story.sourceCount, 'report')}
      </Text>
      <Text style={cardStyles.title}>{story.title}</Text>
      {story.summary ? (
        <Text numberOfLines={3} style={cardStyles.summary}>
          {stripCitations(story.summary).replace(/\s+([.,;:])/g, '$1')}
        </Text>
      ) : null}
      {publishers ? (
        <Text numberOfLines={1} style={styles.publishers}>
          {publishers}
        </Text>
      ) : null}
    </DeskCard>
  )
}

const KIND_LABELS = { story: 'Story', narrative: 'Narrative' } as const

/** The card stories and narratives share: a bar in the desk's colour over the card's body. */
export function DeskCard({
  kind,
  desk,
  title,
  onPress,
  children,
}: {
  kind: 'story' | 'narrative'
  desk: Desk | null
  title: string
  onPress: () => void
  children: ReactNode
}) {
  const { fill, ink } = deskColors(desk)
  return (
    <Pressable
      accessibilityHint={`Opens this ${kind}`}
      accessibilityLabel={title}
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
    >
      <View style={[styles.bar, { backgroundColor: fill }]}>
        <Text numberOfLines={1} style={[styles.barText, { color: ink }]}>
          {desk ? DESK_LABELS[desk] : KIND_LABELS[kind]}
        </Text>
      </View>
      <View style={styles.body}>{children}</View>
    </Pressable>
  )
}

export const cardStyles = StyleSheet.create({
  meta: { color: t.color.textMuted, fontFamily: t.font.medium, fontSize: t.type.meta },
  title: { color: t.color.text, fontFamily: t.font.black, fontSize: 24, lineHeight: 25 },
  summary: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
  },
})

const styles = StyleSheet.create({
  card: {
    backgroundColor: t.color.surface,
    borderColor: t.color.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardPressed: { opacity: 0.7 },
  bar: { minHeight: 28, paddingHorizontal: t.space[3], justifyContent: 'center' },
  barText: {
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  body: { gap: t.space[2], padding: t.space[4] },
  publishers: {
    color: t.color.textMuted,
    fontFamily: t.font.medium,
    fontSize: t.type.meta,
    marginTop: t.space[1],
  },
})
