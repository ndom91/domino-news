import { nativeTokens as t } from '@dn/design-tokens/native'
import { clockTime, formatDate, plural } from '@dn/domain'
import type { StorySource } from '@dn/schemas'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { openExternalLink } from './open-external-link'
import { SourceTrace } from './source-trace'
import { useStoryTheme } from './story-theme'

export function WhoReported({
  sources,
  now,
  onSeeReports,
}: {
  sources: StorySource[]
  now: string
  onSeeReports: () => void
}) {
  const theme = useStoryTheme()
  const ordered = [...sources].sort((a, b) =>
    (a.publishedAt ?? a.observedAt).localeCompare(b.publishedAt ?? b.observedAt),
  )
  const publishers = new Set(sources.map((s) => s.publisher.id)).size
  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={[styles.label, { color: theme.color.text }]}>
          Who reported it
        </Text>
        <Text style={[styles.count, { color: theme.color.textMuted }]}>
          {plural(publishers, 'publisher')}
        </Text>
      </View>
      <SourceTrace sources={sources} now={now} />
      <View style={[styles.board, { borderColor: theme.color.rule }]}>
        {ordered.slice(0, 4).map((source) => (
          <Pressable
            key={source.articleId}
            accessibilityRole="link"
            accessibilityLabel={`${source.publisher.name}, ${formatDate(source.publishedAt ?? source.observedAt)}, ${source.citation ? `source ${source.citation}` : 'reported, not cited'}`}
            onPress={() => void openExternalLink(source.url)}
            style={[styles.row, { borderColor: theme.color.border }]}
          >
            <Text
              style={[
                styles.time,
                { color: source.citedInSummary ? theme.color.text : theme.color.textMuted },
              ]}
            >
              {clockTime(source.publishedAt ?? source.observedAt)}
            </Text>
            <View style={styles.publisher}>
              <Text
                numberOfLines={1}
                style={[
                  styles.name,
                  { color: source.citedInSummary ? theme.color.text : theme.color.textMuted },
                ]}
              >
                {source.publisher.name}
              </Text>
              <Text style={[styles.date, { color: theme.color.text }]}>
                {formatDate(source.publishedAt ?? source.observedAt)}
              </Text>
            </View>
            <View
              aria-hidden
              style={[
                styles.badge,
                {
                  borderColor: theme.color.text,
                  backgroundColor: source.citedInSummary ? theme.color.text : theme.color.canvas,
                },
              ]}
            >
              <Text style={[styles.number, { color: theme.color.canvas }]}>
                {source.citation ?? ''}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      {!sources.length ? (
        <Text style={{ color: theme.color.textMuted }}>No reports available yet.</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        onPress={onSeeReports}
        style={[styles.button, { borderColor: theme.color.rule }]}
      >
        <Text style={[styles.buttonText, { color: theme.color.text }]}>
          See all {plural(sources.length, 'report')}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: t.space[3], marginTop: t.space[10], paddingHorizontal: t.space[4] },
  heading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: t.space[2],
    borderBottomWidth: 3,
    borderBottomColor: t.color.accent,
    paddingBottom: t.space[3],
  },
  label: {
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    textTransform: 'uppercase',
    flexShrink: 1,
  },
  count: { fontFamily: t.font.medium, fontSize: t.type.meta },
  board: { borderTopWidth: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: t.space[2],
  },
  time: { fontFamily: t.font.condensedBold, fontSize: 25, width: 64 },
  publisher: { flex: 1, minWidth: 0 },
  name: { fontFamily: t.font.bold, fontSize: t.type.label },
  date: { fontFamily: t.font.regular, fontSize: 11 },
  badge: { width: 28, height: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  number: { fontFamily: t.font.bold, fontSize: 12 },
  button: {
    minHeight: t.size.tap,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: t.space[3],
  },
  buttonText: { fontFamily: t.font.bold, fontSize: t.type.label },
})
