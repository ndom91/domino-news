import { nativeTokens as t } from '@dn/design-tokens/native'
import { clockTime, formatDate, plural, stripCitations } from '@dn/domain'
import type { StoryUpdateEvent } from '@dn/schemas'
import Feather from '@expo/vector-icons/Feather'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { PublisherLogo } from '../publisher-logo'
import { openExternalLink } from './open-external-link'

const labels: Record<StoryUpdateEvent['kind'], string> = {
  summary_revision: 'Summary revised',
  new_reporting: 'New reporting',
  official_response: 'Official response',
  consequence: 'Consequence',
  new_primary_source: 'Primary document added',
  correction_or_clarification: 'Correction or clarification',
  analysis: 'Analysis',
}
const SHOWN = 5

export function StoryUpdates({
  items,
  title = 'What changed',
}: {
  items: StoryUpdateEvent[]
  title?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, SHOWN)
  if (!items.length) return null
  const multipleYears =
    new Set(visible.map((item) => new Date(item.createdAt).getUTCFullYear())).size > 1
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={styles.heading}>
          {title}
        </Text>
        <Text style={styles.count}>{plural(items.length, 'update')}</Text>
      </View>
      {visible.map((item, index) => (
        <View key={item.id}>
          {index === 0 ||
          new Date(visible[index - 1]?.createdAt ?? item.createdAt).toISOString().slice(0, 10) !==
            new Date(item.createdAt).toISOString().slice(0, 10) ? (
            <Text style={styles.date}>
              {formatDate(item.createdAt)}
              {multipleYears ? ` ${new Date(item.createdAt).getUTCFullYear()}` : ''} · UTC
            </Text>
          ) : null}
          <UpdateRow item={item} />
        </View>
      ))}
      {items.length > SHOWN ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(!expanded)}
          style={({ pressed }) => [styles.allButton, pressed && styles.pressed]}
        >
          <Text style={styles.allButtonText}>
            {expanded ? 'Show fewer changes' : 'View all changes'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function UpdateRow({ item }: { item: StoryUpdateEvent }) {
  const router = useRouter()
  const [compare, setCompare] = useState(false)
  const compact =
    item.kind === 'new_reporting' &&
    item.sources.length > 0 &&
    !item.relatedStory &&
    !item.summaryDiff
  return (
    <View style={styles.row}>
      <Text style={[styles.time, item.kind === 'summary_revision' && styles.timeImportant]}>
        {clockTime(item.createdAt)}
      </Text>
      <View style={styles.line}>
        <View
          style={[styles.marker, item.kind === 'summary_revision' ? styles.revision : styles.other]}
        />
      </View>
      <View style={[styles.content, compact && styles.compactContent]}>
        {compact ? (
          <View style={styles.sourceRow}>
            <Text style={styles.kind}>+{plural(item.sources.length, 'source')}</Text>
            <SourceLinks sources={item.sources} />
          </View>
        ) : (
          <>
            <Text style={styles.kind}>{labels[item.kind]}</Text>
            <Text style={styles.description}>{item.description}</Text>
            <View style={styles.sourceRow}>
              <SourceLinks sources={item.sources} />
              {item.summaryDiff?.previous ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    compare ? 'Hide summary comparison' : 'Compare summary versions'
                  }
                  accessibilityState={{ expanded: compare }}
                  onPress={() => setCompare(!compare)}
                  style={({ pressed }) => [styles.compare, pressed && styles.pressed]}
                >
                  <Text style={styles.compareText}>{compare ? 'Hide' : 'Compare'} ›</Text>
                </Pressable>
              ) : null}
            </View>
            {item.relatedStory ? (
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push(`/stories/${item.relatedStory?.slug}`)}
                style={styles.related}
              >
                <Text style={styles.compareText}>{item.relatedStory.title}</Text>
              </Pressable>
            ) : null}
            {compare && item.summaryDiff?.previous ? (
              <View style={styles.versions}>
                <Text style={styles.kind}>Before</Text>
                <Text style={styles.body}>{stripCitations(item.summaryDiff.previous)}</Text>
                <Text style={styles.kind}>After</Text>
                <Text style={styles.body}>{stripCitations(item.summaryDiff.current)}</Text>
              </View>
            ) : null}
          </>
        )}
      </View>
    </View>
  )
}

function SourceLinks({ sources }: { sources: StoryUpdateEvent['sources'] }) {
  return (
    <View style={styles.sources}>
      {sources.map((source) => (
        <Pressable
          key={source.url}
          accessibilityRole="link"
          accessibilityLabel={`Open ${source.title}${source.publisher ? ` from ${source.publisher.name}` : ''}`}
          onPress={() => void openExternalLink(source.url)}
          style={({ pressed }) => [styles.source, pressed && styles.pressed]}
        >
          {source.publisher ? (
            <PublisherLogo
              slug={source.publisher.slug}
              size={22}
              fallback={source.publisher.name}
            />
          ) : (
            <Feather name="file-text" size={18} color={t.color.textSecondary} />
          )}
          <Text style={styles.sourceName}>{source.publisher?.name ?? source.title}</Text>
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { marginTop: t.space[10] },
  sectionHeader: {
    alignItems: 'baseline',
    borderBottomColor: t.color.accent,
    borderBottomWidth: 4,
    flexDirection: 'row',
    gap: t.space[2],
    justifyContent: 'space-between',
    paddingBottom: t.space[2],
  },
  heading: {
    color: t.color.text,
    flexShrink: 1,
    fontFamily: t.font.black,
    fontSize: t.type.headline,
    textTransform: 'uppercase',
  },
  count: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.meta },
  date: {
    color: t.color.textMuted,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    marginLeft: 60,
    paddingTop: t.space[2],
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row' },
  time: {
    color: t.color.textMuted,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    fontVariant: ['tabular-nums'],
    paddingTop: t.space[3],
    width: 54,
  },
  timeImportant: { color: t.color.text, fontSize: t.type.body },
  line: { alignItems: 'center', borderLeftColor: t.color.rule, borderLeftWidth: 1, width: 16 },
  marker: { height: 9, left: -5, position: 'absolute', top: 16, width: 9 },
  revision: { backgroundColor: t.color.accent },
  other: { backgroundColor: t.color.canvas, borderColor: t.color.text, borderWidth: 2 },
  content: {
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flex: 1,
    gap: t.space[1],
    paddingVertical: t.space[3],
  },
  compactContent: { paddingVertical: 0 },
  kind: {
    color: t.color.textMuted,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    textTransform: 'uppercase',
  },
  description: { color: t.color.text, fontFamily: t.font.bold, fontSize: 15, lineHeight: 21 },
  sourceRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: t.space[1] },
  sources: { flexDirection: 'row', flexShrink: 1, flexWrap: 'wrap' },
  source: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: t.space[1],
    minHeight: t.size.tap,
    paddingRight: t.space[2],
  },
  sourceName: {
    color: t.color.textSecondary,
    flexShrink: 1,
    fontFamily: t.font.regular,
    fontSize: t.type.meta,
  },
  compare: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
    minHeight: t.size.tap,
    paddingHorizontal: t.space[2],
  },
  compareText: { color: t.color.accentText, fontFamily: t.font.bold, fontSize: t.type.meta },
  related: { justifyContent: 'center', minHeight: t.size.tap },
  versions: { gap: t.space[2], paddingBottom: t.space[2] },
  body: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
  },
  pressed: { opacity: 0.7 },
  allButton: {
    alignItems: 'center',
    borderColor: t.color.rule,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: t.space[4],
    minHeight: t.size.tap,
  },
  allButtonText: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
})
