import { nativeTokens as t } from '@dn/design-tokens/native'
import { formatDate, hostnameOf, plural } from '@dn/domain'
import { LEAN_LABELS, type StoryLean, type StorySource } from '@dn/schemas'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { groupReporting } from '../../lib/reporting-groups'
import { PublisherLogo } from '../publisher-logo'
import { Button, uiStyles } from '../ui'
import { openExternalLink } from './open-external-link'

const EXCERPT_MAX_LENGTH = 360

// StoryReporting renders the publisher articles covering a story.
export function StoryReporting({
  onPublisherPress,
  sources,
  leanMix,
}: {
  onPublisherPress: (slug: string) => void
  sources: StorySource[]
  leanMix: StoryLean[]
}) {
  const [expanded, setExpanded] = useState(false)
  const [view, setView] = useState<'lean' | 'time'>('lean')
  const publisherCount = new Set(sources.map((source) => source.publisher.id)).size
  const { ordered: orderedSources, ratings, groups: grouped } = groupReporting(sources, leanMix)
  const shownSources =
    view === 'time'
      ? (expanded ? orderedSources : orderedSources.slice(0, 5)).map((source) => ({
          source,
          heading: null,
        }))
      : grouped.flatMap(({ group, items }) =>
          (expanded ? items : items.slice(0, 2)).map((source, index) => ({
            source,
            heading: index === 0 ? (group === 'unrated' ? 'Not rated' : LEAN_LABELS[group]) : null,
          })),
        )

  return (
    <View style={styles.section}>
      <Text style={uiStyles.label}>Original reporting</Text>
      <Text style={styles.caption}>
        {plural(sources.length, 'report')} from {plural(publisherCount, 'publisher')}
      </Text>
      <Text style={styles.intro}>
        Lean describes the publisher, not an individual report. Estimates are marked.
      </Text>
      <View style={{ flexDirection: 'row', gap: t.space[2] }}>
        <Button
          tone={view === 'lean' ? 'dark' : 'light'}
          onPress={() => {
            setView('lean')
            setExpanded(false)
          }}
        >
          By lean
        </Button>
        <Button
          tone={view === 'time' ? 'dark' : 'light'}
          onPress={() => {
            setView('time')
            setExpanded(false)
          }}
        >
          By time
        </Button>
      </View>
      {shownSources.map(({ source, heading }) => (
        <View key={source.articleId} style={styles.source}>
          {heading ? <Text style={uiStyles.label}>{heading}</Text> : null}
          <Pressable
            accessibilityHint="Opens the publisher"
            accessibilityLabel={`View ${source.publisher.name}`}
            accessibilityRole="link"
            onPress={() => onPublisherPress(source.publisher.slug)}
            style={({ pressed }) => [styles.publisher, pressed ? styles.pressed : null]}
          >
            <PublisherLogo size={28} slug={source.publisher.slug} />
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
              <Text style={styles.description}>{firstParagraph(source.description)}</Text>
            ) : null}
            <Text style={styles.metadata}>
              {source.official ? 'Official source · ' : ''}
              {ratings.get(source.publisher.id)?.estimated ? 'Estimated lean · ' : ''}
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
      {(
        view === 'time'
          ? orderedSources.length > 5
          : grouped.some((group) => group.items.length > 2)
      ) ? (
        <Button onPress={() => setExpanded((current) => !current)} tone="light">
          {expanded ? 'Show fewer reports' : `View all ${plural(orderedSources.length, 'report')}`}
        </Button>
      ) : null}
    </View>
  )
}

function firstParagraph(text: string) {
  const paragraph = (text.trim().split(/\n\s*\n/, 1)[0] ?? '').replace(/\s+/g, ' ')
  if (paragraph.length <= EXCERPT_MAX_LENGTH) return paragraph

  const boundary = paragraph.lastIndexOf(' ', EXCERPT_MAX_LENGTH)
  return `${paragraph.slice(0, boundary > 0 ? boundary : EXCERPT_MAX_LENGTH)}…`
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
  publisher: { alignItems: 'center', flexDirection: 'row', gap: t.space[2], minHeight: t.size.tap },
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
