import { nativeTokens as t } from '@dn/design-tokens/native'
import { formatDate, plural, shortRelative, summaryParagraphs } from '@dn/domain'
import { DESK_LABELS, DESK_SLOT, REGION_LABELS, type StoryDetail } from '@dn/schemas'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native'
import { SourceTrace } from './source-trace'
import { ContextSheet } from './story-background'
import { useStoryTheme } from './story-theme'
import { SummaryText } from './summary-text'

/** One continuous, cited summary: desk-coloured lead and an overlapping paper continuation. */
export function StoryHeader({
  story,
  now,
  onHeroLayout,
}: {
  story: StoryDetail
  now: string
  onHeroLayout?: (event: LayoutChangeEvent) => void
}) {
  const theme = useStoryTheme()
  const router = useRouter()
  const [selectedContext, setSelectedContext] = useState<StoryDetail['context'][number] | null>(
    null,
  )
  const [lead, ...rest] = summaryParagraphs(story.summary, story.context)
  const hasSheet = rest.length > 0
  const slot = story.desk ? DESK_SLOT[story.desk] : 0
  const fill = theme.color.narrative[slot]
  const ink = theme.color.narrativeText[slot]
  const regions = story.regions.map((region) => REGION_LABELS[region]).join(' · ')
  const narrative = story.narratives[0]
  const publishers = new Set(story.sources.map((s) => s.publisher.id)).size
  const cited = new Set(story.sources.filter((s) => s.citedInSummary).map((s) => s.publisher.id))
    .size
  const provenance = story.summary
    ? `${story.summary.origin === 'edited' ? 'Edited' : 'Machine-generated'} summary from ${cited} of ${plural(publishers, 'publisher')} · Updated ${shortRelative(story.summary.createdAt, new Date(now))}`
    : ''
  const notice = story.summaryUpdate ? (
    <View
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
      style={[styles.updating, { backgroundColor: theme.color.sunken }]}
    >
      <View aria-hidden style={styles.square} />
      <Text style={[styles.updatingText, { color: theme.color.text }]}>
        {plural(story.summaryUpdate.newReports, 'new report')} since this version
      </Text>
    </View>
  ) : null
  return (
    <>
      <View
        onLayout={onHeroLayout}
        style={[styles.hero, { backgroundColor: fill, paddingBottom: hasSheet ? 76 : t.space[8] }]}
      >
        {/* Extends the desk fill into iOS rubber-band overscroll, inside the scroll view's clip. */}
        <View
          pointerEvents="none"
          aria-hidden
          style={[styles.overscroll, { backgroundColor: fill }]}
        />
        <View style={[styles.tags, { borderColor: ink }]}>
          <Text style={[styles.tag, { color: ink, flex: 1 }]}>
            {story.desk ? DESK_LABELS[story.desk] : 'Story'}
            {regions ? ` · ${regions}` : ''}
          </Text>
          <Text style={[styles.tag, { color: ink }]}>{formatDate(story.firstObservedAt)}</Text>
        </View>
        {narrative ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/narratives/${narrative.slug}`)}
            style={styles.narrative}
          >
            <Text style={[styles.narrativeText, { color: ink }]}>{narrative.title}</Text>
          </Pressable>
        ) : null}
        <Text accessibilityRole="header" style={[styles.title, { color: ink }]}>
          {story.title}
        </Text>
        {lead ? (
          <Text style={[styles.body, styles.lead, { color: ink }]}>
            <SummaryText
              {...lead}
              sources={story.sources}
              ink={ink}
              onContextPress={setSelectedContext}
            />
          </Text>
        ) : (
          <Text style={[styles.body, { color: ink }]}>This story is still being summarised.</Text>
        )}
        <View style={[styles.meta, { borderColor: ink }]}>
          <Text style={[styles.metaText, { color: ink }]}>
            {plural(publishers, 'publisher')} · {cited} cited
          </Text>
          <SourceTrace sources={story.sources} now={now} compact ink={ink} />
        </View>
        {!hasSheet && provenance ? (
          <Text style={[styles.provenance, { color: ink }]}>{provenance}</Text>
        ) : null}
      </View>
      {hasSheet ? (
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.color.canvas, borderTopColor: theme.color.rule },
          ]}
        >
          {notice}
          {rest.map((paragraph, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs belong to a fixed summary version
            <Text key={index} style={[styles.body, { color: theme.color.text }]}>
              <SummaryText
                {...paragraph}
                sources={story.sources}
                onContextPress={setSelectedContext}
              />
            </Text>
          ))}
          <Text
            style={[
              styles.provenance,
              styles.sheetProvenance,
              { color: theme.color.textMuted, borderColor: theme.color.border },
            ]}
          >
            {provenance}
          </Text>
        </View>
      ) : notice ? (
        <View style={styles.noSheetNotice}>{notice}</View>
      ) : null}
      <ContextSheet entry={selectedContext} onClose={() => setSelectedContext(null)} />
    </>
  )
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: t.space[4], paddingTop: t.space[5] },
  overscroll: { position: 'absolute', top: -1000, height: 1000, left: 0, right: 0 },
  tags: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: t.space[3],
    borderBottomWidth: 2,
    paddingBottom: t.space[3],
    marginBottom: t.space[3],
  },
  tag: { fontFamily: t.font.bold, fontSize: t.type.meta, textTransform: 'uppercase' },
  narrative: { minHeight: t.size.tap, justifyContent: 'center' },
  narrativeText: {
    fontFamily: t.font.semibold,
    fontSize: t.type.label,
    textDecorationLine: 'underline',
  },
  title: { fontFamily: t.font.condensed, fontSize: 40, lineHeight: 40, letterSpacing: -0.8 },
  body: { fontFamily: t.font.regular, fontSize: 17, lineHeight: 26.5 },
  lead: { marginTop: t.space[5] },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.space[3],
    borderTopWidth: 1,
    paddingTop: t.space[3],
    marginTop: t.space[5],
  },
  metaText: { fontFamily: t.font.semibold, fontSize: t.type.meta },
  provenance: { fontFamily: t.font.regular, fontSize: 12, lineHeight: 18, marginTop: t.space[3] },
  sheet: {
    marginTop: -52,
    marginHorizontal: t.space[2],
    borderTopWidth: 6,
    padding: t.space[4],
    paddingTop: t.space[5],
    gap: t.space[4],
  },
  sheetProvenance: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: t.space[3],
    marginTop: 0,
  },
  updating: { flexDirection: 'row', alignItems: 'center', gap: t.space[3], padding: t.space[3] },
  updatingText: { flex: 1, fontFamily: t.font.semibold, fontSize: 12, lineHeight: 18 },
  square: { width: 10, height: 10, backgroundColor: t.color.accent },
  noSheetNotice: { margin: t.space[4] },
})
