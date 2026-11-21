import { clockTime, dayDateLabel, plural, stripCitations } from '@dn/domain'
import { STORY_UPDATE_LABELS, type StoryUpdateEvent } from '@dn/schemas'
import Feather from '@expo/vector-icons/Feather'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { PublisherLogo } from '../publisher-logo'
import { openExternalLink } from './open-external-link'
import { type StoryTokens, useStoryTheme } from './story-theme'

const SHOWN = 5

function utcDayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

function groupUpdatesByUtcDay(items: StoryUpdateEvent[]) {
  const days: { dayKey: string; firstCreatedAt: string; items: StoryUpdateEvent[] }[] = []
  for (const item of items) {
    const dayKey = utcDayKey(item.createdAt)
    const last = days[days.length - 1]
    if (last?.dayKey === dayKey) last.items.push(item)
    else days.push({ dayKey, firstCreatedAt: item.createdAt, items: [item] })
  }
  return days
}

export function StoryUpdates({
  items,
  now,
  title = 'What changed',
}: {
  items: StoryUpdateEvent[]
  now?: string
  title?: string
}) {
  const t = useStoryTheme()
  const styles = createStyles(t)
  const [expanded, setExpanded] = useState(false)
  const [defaultNow] = useState(() => new Date().toISOString())
  if (!items.length) return null
  const referenceNow = now ?? defaultNow
  const visible = expanded ? items : items.slice(0, SHOWN)
  const multipleYears =
    new Set(visible.map((item) => new Date(item.createdAt).getUTCFullYear())).size > 1
  const dayGroups = groupUpdatesByUtcDay(visible)
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={styles.heading}>
          {title}
        </Text>
        <Text style={styles.count}>{plural(items.length, 'update')}</Text>
      </View>
      {dayGroups.map((group, groupIndex) => (
        <View
          key={group.items[0]?.id ?? group.dayKey}
          style={groupIndex === 0 ? undefined : styles.dayGroup}
        >
          <View accessible accessibilityRole="header" style={styles.dayBand}>
            <Text style={styles.dayBandText}>
              {dayDateLabel(group.firstCreatedAt, referenceNow, multipleYears)}
            </Text>
            <Text style={styles.dayBandZone}>UTC</Text>
          </View>
          {group.items.map((item) => (
            <UpdateRow key={item.id} item={item} />
          ))}
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
  const t = useStoryTheme()
  const styles = createStyles(t)
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
            <Text numberOfLines={1} style={styles.kind}>
              +{plural(item.sources.length, 'source')}
            </Text>
            <SourceLinks sources={item.sources} />
          </View>
        ) : (
          <>
            <Text style={styles.kind}>{STORY_UPDATE_LABELS[item.kind]}</Text>
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
  const t = useStoryTheme()
  const styles = createStyles(t)
  if (sources.length === 0) return null
  return (
    <>
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
          <Text numberOfLines={1} style={styles.sourceName}>
            {source.publisher?.name ?? source.title}
          </Text>
        </Pressable>
      ))}
    </>
  )
}

const createStyles = (t: StoryTokens) =>
  StyleSheet.create({
    section: { marginTop: t.space[10] },
    sectionHeader: {
      alignItems: 'baseline',
      borderBottomColor: t.color.accent,
      borderBottomWidth: 4,
      flexDirection: 'row',
      gap: t.space[2],
      justifyContent: 'space-between',
      marginBottom: t.space[5],
      paddingBottom: t.space[2],
    },
    heading: {
      color: t.color.text,
      flexShrink: 1,
      fontFamily: t.font.condensed,
      fontSize: t.type.headline,
      textTransform: 'uppercase',
    },
    count: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.meta },
    dayGroup: { marginTop: 22 },
    dayBand: {
      alignItems: 'center',
      backgroundColor: t.color.band,
      flexDirection: 'row',
      gap: t.space[4],
      justifyContent: 'space-between',
      paddingBottom: 8,
      paddingHorizontal: 14,
      paddingTop: 9,
    },
    dayBandText: {
      color: t.color.bandText,
      flexShrink: 1,
      fontFamily: t.font.condensed,
      fontSize: 22,
      letterSpacing: -0.22,
      lineHeight: 22,
      textTransform: 'uppercase',
    },
    dayBandZone: {
      color: t.color.bandMuted,
      fontFamily: t.font.semibold,
      fontSize: t.type.meta,
      lineHeight: t.type.meta,
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
    sourceRow: {
      alignItems: 'center',
      columnGap: t.space[3],
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    source: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: t.space[1],
      maxWidth: '100%',
      minHeight: t.size.tap,
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
