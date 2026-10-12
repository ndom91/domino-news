import { nativeTokens as t } from '@dn/design-tokens/native'
import { plural, shortRelative } from '@dn/domain'
import { DESK_LABELS, DESK_SLOT, type StoryListItem } from '@dn/schemas'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'

export function StoryCard({ story, now }: { story: StoryListItem; now: string }) {
  const router = useRouter()
  const slot = story.desk ? DESK_SLOT[story.desk] : 0
  const keyColor = t.color.narrative[slot] ?? t.color.narrative[0]
  const keyText = t.color.narrativeText[slot] ?? t.color.narrativeText[0]
  const publishers = story.publishers
    .slice(0, 3)
    .map((publisher) => publisher.name)
    .join(' · ')

  return (
    <Pressable
      accessibilityHint="Opens this story"
      accessibilityLabel={story.title}
      accessibilityRole="link"
      onPress={() => router.push(`/stories/${story.slug}`)}
      style={({ pressed }) => [styles.card, pressed ? styles.cardPressed : null]}
    >
      <View style={[styles.bar, { backgroundColor: keyColor }]}>
        <Text numberOfLines={1} style={[styles.barText, { color: keyText }]}>
          {story.desk ? DESK_LABELS[story.desk] : 'Story'}
        </Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.meta}>
          {shortRelative(story.lastUpdatedAt, new Date(now))} ·{' '}
          {plural(story.sourceCount, 'report')}
        </Text>
        <Text style={styles.title}>{story.title}</Text>
        {story.summary ? (
          <Text numberOfLines={3} style={styles.summary}>
            {story.summary}
          </Text>
        ) : null}
        {publishers ? (
          <Text numberOfLines={1} style={styles.publishers}>
            {publishers}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
}

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
  meta: { color: t.color.textMuted, fontFamily: t.font.medium, fontSize: t.type.meta },
  title: { color: t.color.text, fontFamily: t.font.black, fontSize: 24, lineHeight: 25 },
  summary: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
  },
  publishers: {
    color: t.color.textMuted,
    fontFamily: t.font.medium,
    fontSize: t.type.meta,
    marginTop: t.space[1],
  },
})
