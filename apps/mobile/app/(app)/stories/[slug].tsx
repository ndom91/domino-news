import { nativeTokens as t } from '@dn/design-tokens/native'
import { formatDate, hostnameOf, plural } from '@dn/domain'
import { REGION_LABELS, type StoryContextItem } from '@dn/schemas'
import { useQuery } from '@tanstack/react-query'
import { Redirect, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StoryLeanMeter } from '../../../components/story-lean'
import { Button, LoadingView, MessageView, Screen, uiStyles } from '../../../components/ui'
import { isUnauthorized, queries } from '../../../lib/api'

export default function StoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const story = useQuery(queries.story(slug))
  const preferences = useQuery(queries.preferences())
  const [context, setContext] = useState<StoryContextItem | null>(null)
  const [sourcesExpanded, setSourcesExpanded] = useState(false)

  if (story.isPending)
    return (
      <Screen>
        <LoadingView label="Loading story" />
      </Screen>
    )
  if (isUnauthorized(story.error)) return <Redirect href="/sign-in" />
  if (story.isError)
    return (
      <Screen>
        <MessageView
          detail="This story may no longer be available."
          title="Story unavailable"
          action={{ label: 'Try again', onPress: story.refetch }}
        />
      </Screen>
    )

  const data = story.data
  const publisherCount = new Set(data.sources.map((source) => source.publisher.id)).size
  const regions = data.regions.map((region) => REGION_LABELS[region]).join(' · ')
  const orderedSources = [...data.sources].sort((a, b) =>
    (a.publishedAt ?? a.observedAt).localeCompare(b.publishedAt ?? b.observedAt),
  )
  const shownSources = sourcesExpanded ? orderedSources : orderedSources.slice(0, 5)

  return (
    <Screen>
      <ScrollView contentContainerStyle={uiStyles.content}>
        <Text style={uiStyles.eyebrow}>
          {data.desk ?? 'Story'}
          {regions ? ` · ${regions}` : ''}
        </Text>
        <Text style={styles.title}>{data.title}</Text>
        <Text style={styles.time}>First reported {formatDate(data.firstObservedAt)}</Text>
        {data.summary ? (
          <View style={styles.summary}>
            <Text style={styles.summaryHeadline}>{data.summary.headline}</Text>
            <Text style={styles.summaryBody}>{data.summary.body}</Text>
          </View>
        ) : (
          <Text style={styles.pending}>This story is still being summarised.</Text>
        )}
        <StoryLeanMeter country={preferences.data?.country ?? null} mix={data.leanMix} />
        {data.context.length > 0 ? (
          <View style={styles.section}>
            <Text style={uiStyles.label}>Background</Text>
            {data.context.map((entry) => (
              <Pressable
                accessibilityHint="Opens background information"
                accessibilityRole="button"
                key={entry.id}
                onPress={() => setContext(entry)}
                style={({ pressed }) => [styles.context, pressed ? styles.pressed : null]}
              >
                <Text style={styles.contextTitle}>{entry.title}</Text>
                <Text numberOfLines={2} style={styles.contextPreview}>
                  {entry.explanation}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.section}>
          <Text style={uiStyles.label}>Original reporting</Text>
          <Text style={styles.caption}>
            {plural(data.sources.length, 'report')} from {plural(publisherCount, 'publisher')}
          </Text>
          {shownSources.map((source) => (
            <Pressable
              accessibilityHint="Opens the publisher’s article"
              accessibilityRole="link"
              key={source.articleId}
              onPress={() => Linking.openURL(source.url)}
              style={({ pressed }) => [styles.source, pressed ? styles.pressed : null]}
            >
              <Text style={styles.sourcePublisher}>
                {source.publisher.name}
                {source.citedInSummary ? ' · Cited' : ''}
              </Text>
              <Text style={styles.sourceTitle}>{source.title}</Text>
              <Text style={styles.sourceDomain}>{hostnameOf(source.url) ?? source.url}</Text>
            </Pressable>
          ))}
          {shownSources.length < orderedSources.length ? (
            <Button onPress={() => setSourcesExpanded(true)} tone="light">
              {`View all ${plural(orderedSources.length, 'report')}`}
            </Button>
          ) : null}
        </View>
      </ScrollView>
      <ContextSheet entry={context} onClose={() => setContext(null)} />
    </Screen>
  )
}

function ContextSheet({ entry, onClose }: { entry: StoryContextItem | null; onClose: () => void }) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={entry !== null}>
      <View style={styles.sheetScrim}>
        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet}>
          {entry ? (
            <>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{entry.title}</Text>
                <Pressable
                  accessibilityLabel={`Close ${entry.title}`}
                  accessibilityRole="button"
                  onPress={onClose}
                  style={styles.close}
                >
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
              </View>
              <Text style={styles.sheetBody}>{entry.explanation}</Text>
              {entry.sources.length > 0 ? (
                <Text style={styles.sheetSources}>
                  Grounded in {entry.sources.map((source) => source.publisherName).join(' · ')}
                </Text>
              ) : null}
            </>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  title: {
    color: t.color.text,
    fontFamily: t.font.black,
    fontSize: 34,
    letterSpacing: -0.8,
    lineHeight: 35,
    marginTop: t.space[3],
  },
  time: {
    color: t.color.textMuted,
    fontFamily: t.font.medium,
    fontSize: t.type.meta,
    marginTop: t.space[3],
  },
  summary: {
    borderLeftColor: t.color.accent,
    borderLeftWidth: 4,
    gap: t.space[3],
    marginTop: t.space[6],
    paddingLeft: t.space[4],
  },
  summaryHeadline: {
    color: t.color.text,
    fontFamily: t.font.bold,
    fontSize: t.type.bodyLarge,
    lineHeight: 25,
  },
  summaryBody: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.bodyLarge,
    lineHeight: 27,
  },
  pending: {
    color: t.color.textMuted,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    marginTop: t.space[6],
  },
  section: { gap: t.space[3], marginTop: t.space[10] },
  caption: {
    color: t.color.textMuted,
    fontFamily: t.font.regular,
    fontSize: t.type.meta,
    marginTop: -t.space[1],
  },
  context: {
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: t.space[1],
    paddingBottom: t.space[3],
  },
  contextTitle: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
  contextPreview: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 22,
  },
  source: {
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: t.space[1],
    paddingBottom: t.space[3],
  },
  sourcePublisher: { color: t.color.accentText, fontFamily: t.font.bold, fontSize: t.type.meta },
  sourceTitle: {
    color: t.color.text,
    fontFamily: t.font.bold,
    fontSize: t.type.bodyLarge,
    lineHeight: 23,
  },
  sourceDomain: { color: t.color.textMuted, fontFamily: t.font.regular, fontSize: t.type.meta },
  pressed: { opacity: 0.7 },
  sheetScrim: { backgroundColor: 'rgba(18, 18, 18, 0.48)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: t.color.elevated, gap: t.space[4], padding: t.space[5] },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: t.space[4],
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: t.color.text,
    flex: 1,
    fontFamily: t.font.black,
    fontSize: t.type.headline,
    lineHeight: 29,
  },
  close: {
    alignItems: 'center',
    borderColor: t.color.rule,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: t.size.tap,
    paddingHorizontal: t.space[3],
  },
  closeText: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.meta },
  sheetBody: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.bodyLarge,
    lineHeight: 26,
  },
  sheetSources: {
    color: t.color.textMuted,
    fontFamily: t.font.medium,
    fontSize: t.type.meta,
    lineHeight: 18,
  },
})
