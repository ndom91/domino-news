import { nativeTokens as t } from '@dn/design-tokens/native'
import { formatDate, hostnameOf, plural } from '@dn/domain'
import type { StorySource } from '@dn/schemas'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Button, uiStyles } from '../ui'
import { openExternalLink } from './open-external-link'

// StoryReporting renders the publisher articles covering a story.
export function StoryReporting({
  onPublisherPress,
  sources,
}: {
  onPublisherPress: (slug: string) => void
  sources: StorySource[]
}) {
  const [expanded, setExpanded] = useState(false)
  const publisherCount = new Set(sources.map((source) => source.publisher.id)).size
  const orderedSources = [...sources].sort((a, b) => {
    const aAt = a.publishedAt ?? a.observedAt
    const bAt = b.publishedAt ?? b.observedAt
    return aAt.localeCompare(bAt)
  })
  const shownSources = expanded ? orderedSources : orderedSources.slice(0, 5)

  return (
    <View style={styles.section}>
      <Text style={uiStyles.label}>Original reporting</Text>
      <Text style={styles.caption}>
        {plural(sources.length, 'report')} from {plural(publisherCount, 'publisher')}
      </Text>
      <Text style={styles.intro}>
        Headlines and descriptions are as each publisher published them. Open an article to read it
        on the publisher’s site.
      </Text>
      {shownSources.map((source) => (
        <View key={source.articleId} style={styles.source}>
          <Pressable
            accessibilityHint="Opens the publisher"
            accessibilityLabel={`View ${source.publisher.name}`}
            accessibilityRole="link"
            onPress={() => onPublisherPress(source.publisher.slug)}
            style={({ pressed }) => [styles.publisher, pressed ? styles.pressed : null]}
          >
            <Text style={styles.publisherText}>{source.publisher.name}</Text>
          </Pressable>
          <Pressable
            accessibilityHint="Opens the publisher’s article"
            accessibilityLabel={source.title}
            accessibilityRole="link"
            onPress={() => void openExternalLink(source.url)}
            style={({ pressed }) => [styles.article, pressed ? styles.pressed : null]}
          >
            <Text style={styles.title}>{source.title}</Text>
            {source.description ? (
              <Text style={styles.description}>{source.description}</Text>
            ) : null}
            <Text style={styles.metadata}>
              {source.official ? 'Official source · ' : ''}
              {source.citation
                ? `Citation ${source.citation} · `
                : source.citedInSummary
                  ? 'Cited in summary · '
                  : ''}
              {formatDate(source.publishedAt ?? source.observedAt)} ·{' '}
              {hostnameOf(source.url) ?? source.url}
            </Text>
          </Pressable>
        </View>
      ))}
      {orderedSources.length > 5 ? (
        <Button onPress={() => setExpanded((current) => !current)} tone="light">
          {expanded ? 'Show fewer reports' : `View all ${plural(orderedSources.length, 'report')}`}
        </Button>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: t.space[3], marginTop: t.space[10] },
  caption: {
    color: t.color.textMuted,
    fontFamily: t.font.regular,
    fontSize: t.type.meta,
    marginTop: -t.space[1],
  },
  intro: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 22,
  },
  source: {
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: t.space[3],
  },
  publisher: { justifyContent: 'center', minHeight: t.size.tap },
  publisherText: { color: t.color.accentText, fontFamily: t.font.bold, fontSize: t.type.meta },
  article: { gap: t.space[1], minHeight: t.size.tap, paddingBottom: t.space[1] },
  title: {
    color: t.color.text,
    fontFamily: t.font.bold,
    fontSize: t.type.bodyLarge,
    lineHeight: 23,
  },
  description: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 22,
  },
  metadata: {
    color: t.color.textMuted,
    fontFamily: t.font.regular,
    fontSize: t.type.meta,
    lineHeight: 18,
  },
  pressed: { opacity: 0.7 },
})
