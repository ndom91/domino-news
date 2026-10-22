import { nativeTokens as t } from '@dn/design-tokens/native'
import { stripCitations } from '@dn/domain'
import type { StoryContextItem } from '@dn/schemas'
import { StyleSheet, Text } from 'react-native'

type SummaryPart = { text: string } | { text: string; item: StoryContextItem }

/** Mobile equivalent of the web summary renderer: citation-free prose with tappable context terms. */
export function SummaryText({
  context,
  onContextPress,
  text,
}: {
  context: StoryContextItem[]
  onContextPress: (item: StoryContextItem) => void
  text: string
}) {
  return (
    <>
      {annotateText(cleanText(text), context).map((part, index) =>
        'item' in part ? (
          <Text
            accessibilityHint="Opens a definition"
            accessibilityLabel={`${part.text}: ${part.item.title}`}
            accessibilityRole="button"
            key={part.item.id}
            onPress={() => onContextPress(part.item)}
            style={styles.contextTerm}
          >
            {part.text}
          </Text>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: text runs are positional and never reorder
          <Text key={index}>{part.text}</Text>
        ),
      )}
    </>
  )
}

function cleanText(text: string) {
  return stripCitations(text).replace(/\s+([.,;:])/g, '$1')
}

function annotateText(text: string, items: StoryContextItem[]): SummaryPart[] {
  const hits = items
    .map((item) => ({ item, at: text.indexOf(item.anchorText) }))
    .filter((hit) => hit.at >= 0)
    .sort((a, b) => a.at - b.at)
  const parts: SummaryPart[] = []
  let cursor = 0
  for (const { item, at } of hits) {
    if (at < cursor) continue
    if (at > cursor) parts.push({ text: text.slice(cursor, at) })
    parts.push({ text: item.anchorText, item })
    cursor = at + item.anchorText.length
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) })
  return parts
}

const styles = StyleSheet.create({
  contextTerm: {
    // Nested Text cannot use Pressable's hitSlop. Its vertical padding gives short inline terms
    // a reliable 44 px touch target while preserving text wrapping.
    paddingVertical: 10,
    borderBottomColor: t.color.accentText,
    borderBottomWidth: 2,
    borderStyle: 'dotted',
  },
})
