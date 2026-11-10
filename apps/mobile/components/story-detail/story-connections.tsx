import { nativeTokens as t } from '@dn/design-tokens/native'
import { formatDate, hostnameOf, plural, relationLabel } from '@dn/domain'
import type { NarrativeRef, StoryDetail } from '@dn/schemas'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from '../ui'
import { openExternalLink } from './open-external-link'
import { SectionHeading } from './section-heading'

type PrimarySource = StoryDetail['primarySources'][number]
type RelatedStory = StoryDetail['related'][number]
const RELATED_STORIES_LIMIT = 5

// StoryConnections renders the narrative, related stories, and primary documents.
export function StoryConnections({
  narrative,
  onNarrativePress,
  onStoryPress,
  primarySources,
  related,
}: {
  narrative: NarrativeRef | undefined
  onNarrativePress: (slug: string) => void
  onStoryPress: (slug: string) => void
  primarySources: PrimarySource[]
  related: RelatedStory[]
}) {
  const [relatedExpanded, setRelatedExpanded] = useState(false)
  const shownRelated = relatedExpanded ? related : related.slice(0, RELATED_STORIES_LIMIT)

  return (
    <>
      {narrative ? (
        <View style={styles.section}>
          <SectionHeading>Part of a narrative</SectionHeading>
          <Pressable
            accessibilityHint="Opens this narrative"
            accessibilityLabel={narrative.title}
            accessibilityRole="link"
            onPress={() => onNarrativePress(narrative.slug)}
            style={({ pressed }) => [styles.narrative, pressed ? styles.pressed : null]}
          >
            <Text style={styles.narrativeTitle}>{narrative.title}</Text>
            <Text style={styles.narrativeMeta}>{narrative.desk ?? 'Narrative'}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.section}>
        <SectionHeading>Connected stories</SectionHeading>
        {related.length === 0 ? (
          <Text style={styles.empty}>No connected stories found yet.</Text>
        ) : (
          shownRelated.map((story) => (
            <Pressable
              accessibilityHint="Opens this story"
              accessibilityLabel={story.title}
              accessibilityRole="link"
              key={`${story.id}-${story.relation}-${story.direction}`}
              onPress={() => onStoryPress(story.slug)}
              style={({ pressed }) => [styles.related, pressed ? styles.pressed : null]}
            >
              <Text style={styles.relation}>
                {relationLabel(story.relation, story.direction)} · {formatDate(story.lastUpdatedAt)}
              </Text>
              <Text style={styles.relatedTitle}>{story.title}</Text>
            </Pressable>
          ))
        )}
        {related.length > RELATED_STORIES_LIMIT ? (
          <Button onPress={() => setRelatedExpanded((current) => !current)} tone="light">
            {relatedExpanded
              ? 'Show fewer connected stories'
              : `View all ${plural(related.length, 'connected story')}`}
          </Button>
        ) : null}
      </View>
      <View style={styles.section}>
        <SectionHeading>Primary sources</SectionHeading>
        {primarySources.length === 0 ? (
          <Text style={styles.empty}>
            No primary documents found. We only look for them in articles from publishers that let
            us read the full text.
          </Text>
        ) : (
          primarySources.map((source) => {
            const title = source.title ?? hostnameOf(source.url) ?? source.url

            return (
              <Pressable
                accessibilityHint="Opens a primary source"
                accessibilityLabel={title}
                accessibilityRole="link"
                key={source.id}
                onPress={() => void openExternalLink(source.url)}
                style={({ pressed }) => [styles.primary, pressed ? styles.pressed : null]}
              >
                <Text style={styles.primaryKind}>{source.kind}</Text>
                <Text style={styles.primaryTitle}>{title}</Text>
              </Pressable>
            )
          })
        )}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  section: { gap: t.space[3], marginTop: t.space[10] },
  narrative: {
    backgroundColor: t.color.surface,
    borderColor: t.color.border,
    borderWidth: StyleSheet.hairlineWidth,
    gap: t.space[1],
    justifyContent: 'center',
    minHeight: t.size.tap,
    padding: t.space[4],
  },
  narrativeTitle: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.bodyLarge },
  narrativeMeta: { color: t.color.textMuted, fontFamily: t.font.medium, fontSize: t.type.meta },
  related: {
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: t.space[1],
    justifyContent: 'center',
    minHeight: t.size.tap,
    paddingVertical: t.space[2],
  },
  relation: { color: t.color.textMuted, fontFamily: t.font.bold, fontSize: t.type.meta },
  relatedTitle: {
    color: t.color.text,
    fontFamily: t.font.bold,
    fontSize: t.type.bodyLarge,
    lineHeight: 23,
  },
  empty: {
    color: t.color.textMuted,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 22,
  },
  primary: {
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: t.space[1],
    justifyContent: 'center',
    minHeight: t.size.tap,
    paddingVertical: t.space[2],
  },
  primaryKind: { color: t.color.textMuted, fontFamily: t.font.bold, fontSize: t.type.meta },
  primaryTitle: { color: t.color.accentText, fontFamily: t.font.medium, fontSize: t.type.body },
  pressed: { opacity: 0.7 },
})
