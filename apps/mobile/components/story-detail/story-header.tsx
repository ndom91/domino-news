import { nativeTokens as t } from '@dn/design-tokens/native'
import { formatDate } from '@dn/domain'
import { DESK_LABELS, REGION_LABELS, type StoryDetail } from '@dn/schemas'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { ContextSheet } from './story-background'
import { SummaryText } from './summary-text'

// StoryHeader renders the story identity and available summary text.
export function StoryHeader({ story }: { story: StoryDetail }) {
  const [selectedContext, setSelectedContext] = useState<StoryDetail['context'][number] | null>(
    null,
  )
  const regions = story.regions.map((region) => REGION_LABELS[region]).join(' · ')
  const summary = story.summary
  const detail = summary?.detail
  const detailParagraphs = detail ? detail.split(/\n\s*\n/) : []
  let shown = ''

  const summaryText = (text: string) => {
    const context = story.context.filter((item) => !shown.includes(item.anchorText))
    shown += `\n${text}`
    return <SummaryText context={context} onContextPress={setSelectedContext} text={text} />
  }

  return (
    <>
      <Text style={styles.eyebrow}>
        {story.desk ? DESK_LABELS[story.desk] : 'Story'}
        {regions ? ` · ${regions}` : ''}
      </Text>
      <Text style={styles.title}>{story.title}</Text>
      <Text style={styles.time}>First reported {formatDate(story.firstObservedAt)}</Text>
      {summary ? (
        <View style={styles.summary}>
          <Text style={styles.summaryHeadline}>{summaryText(summary.headline)}</Text>
          <Text style={styles.summaryBody}>{summaryText(summary.body)}</Text>
          {detailParagraphs.map((paragraph) => (
            <Text key={`${summary.versionId}-${paragraph}`} style={styles.summaryDetail}>
              {summaryText(paragraph)}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={styles.pending}>This story is still being summarised.</Text>
      )}
      <ContextSheet entry={selectedContext} onClose={() => setSelectedContext(null)} />
    </>
  )
}

const styles = StyleSheet.create({
  eyebrow: {
    color: t.color.textMuted,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
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
  summaryDetail: {
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
})
