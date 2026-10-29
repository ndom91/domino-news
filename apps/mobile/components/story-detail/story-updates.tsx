import { nativeTokens as t } from '@dn/design-tokens/native'
import { formatDateTime, stripCitations } from '@dn/domain'
import type { StoryUpdateEvent } from '@dn/schemas'
import Feather from '@expo/vector-icons/Feather'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { PublisherLogo } from '../publisher-logo'
import { Button } from '../ui'
import { openExternalLink } from './open-external-link'
import { SectionHeading } from './section-heading'

const labels: Record<StoryUpdateEvent['kind'], string> = {
  summary_revision: 'Summary revised',
  new_reporting: 'New reporting',
  official_response: 'Official response',
  consequence: 'Consequence',
  new_primary_source: 'Primary document added',
  correction_or_clarification: 'Correction or clarification',
  analysis: 'Analysis',
}

export function StoryUpdates({
  items,
  title = 'What changed',
}: {
  items: StoryUpdateEvent[]
  title?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const router = useRouter()
  if (!items.length) return null
  return (
    <View style={styles.section}>
      <SectionHeading>{title}</SectionHeading>
      {(expanded ? items : items.slice(0, 5)).map((item) => (
        <View key={item.id} style={styles.item}>
          <Text style={styles.meta}>
            {labels[item.kind]} · {formatDateTime(item.createdAt)}
          </Text>
          <Text style={styles.description}>{item.description}</Text>
          {item.sources.length ? (
            <View style={styles.sources}>
              <Text style={styles.sourcesLabel}>Supported by</Text>
              {item.sources.map((source) => (
                <Pressable
                  key={source.url}
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${source.title}${source.publisher ? ` from ${source.publisher.name}` : ''}`}
                  accessibilityHint="Opens the original source"
                  onPress={() => void openExternalLink(source.url)}
                  style={({ pressed }) => [styles.sourceButton, pressed && styles.pressed]}
                >
                  {source.publisher ? (
                    <PublisherLogo
                      slug={source.publisher.slug}
                      size={28}
                      fallback={source.publisher.name}
                    />
                  ) : (
                    <Feather name="file-text" size={20} color={t.color.textSecondary} />
                  )}
                </Pressable>
              ))}
            </View>
          ) : null}
          {item.relatedStory ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push(`/stories/${item.relatedStory?.slug}`)}
            >
              <Text style={styles.link}>{item.relatedStory.title}</Text>
            </Pressable>
          ) : null}
          {item.summaryDiff?.previous ? (
            <SummaryComparison
              before={item.summaryDiff.previous}
              after={item.summaryDiff.current}
            />
          ) : null}
        </View>
      ))}
      {items.length > 5 ? (
        <Button tone="light" onPress={() => setExpanded(!expanded)}>
          {expanded ? 'Show fewer changes' : `View all ${items.length} changes`}
        </Button>
      ) : null}
    </View>
  )
}
function SummaryComparison({ before, after }: { before: string; after: string }) {
  const [open, setOpen] = useState(false)
  return (
    <View style={styles.comparison}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.compareButton, pressed && styles.pressed]}
      >
        <Feather
          name={open ? 'chevron-down' : 'chevron-right'}
          size={16}
          color={t.color.accentText}
        />
        <Text style={styles.compareText}>
          {open ? 'Hide summary comparison' : 'Compare summary versions'}
        </Text>
      </Pressable>
      {open ? (
        <>
          <Text style={styles.meta}>Before</Text>
          <Text style={styles.text}>{stripCitations(before)}</Text>
          <Text style={styles.meta}>After</Text>
          <Text style={styles.text}>{stripCitations(after)}</Text>
        </>
      ) : null}
    </View>
  )
}
const styles = StyleSheet.create({
  section: { gap: t.space[3], marginTop: t.space[10] },
  item: {
    gap: t.space[2],
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: t.space[3],
  },
  meta: { color: t.color.textMuted, fontFamily: t.font.regular, fontSize: t.type.meta },
  description: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
  text: { color: t.color.textSecondary, fontFamily: t.font.regular, fontSize: t.type.body },
  link: { color: t.color.accentText, fontFamily: t.font.bold, paddingVertical: t.space[2] },
  sources: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', columnGap: t.space[1] },
  sourcesLabel: {
    color: t.color.textMuted,
    fontFamily: t.font.medium,
    fontSize: t.type.meta,
    marginRight: t.space[1],
  },
  sourceButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: t.size.tap,
    minWidth: t.size.tap,
  },
  comparison: { gap: t.space[1] },
  compareButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    minHeight: t.size.tap,
  },
  compareText: { color: t.color.accentText, fontFamily: t.font.semibold, fontSize: t.type.meta },
  pressed: { opacity: 0.7 },
})
