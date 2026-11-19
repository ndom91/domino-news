import { nativeTokens as t } from '@dn/design-tokens/native'
import { clockTime, formatDate, plural } from '@dn/domain'
import type { StorySource } from '@dn/schemas'
import { StyleSheet, Text, View } from 'react-native'
import { useStoryTheme } from './story-theme'

const HOUR = 3_600_000

/** A native, flex-sized 24-hour trace; the adjacent report rows provide its text alternative. */
export function SourceTrace({
  sources,
  now,
  compact = false,
  ink,
}: {
  sources: StorySource[]
  now: string
  compact?: boolean
  ink?: string
}) {
  const theme = useStoryTheme()
  const color = ink ?? theme.color.text
  if (!sources.length) return null
  const latest = Math.max(...sources.map((s) => Date.parse(s.publishedAt ?? s.observedAt)))
  const nowMs = Date.parse(now)
  const end = latest < nowMs - 24 * HOUR ? latest : nowMs
  const cells = Array.from({ length: 24 }, () => [] as StorySource[])
  for (const source of sources) {
    const hoursAgo = (end - Date.parse(source.publishedAt ?? source.observedAt)) / HOUR
    cells[Math.min(23, Math.max(0, Math.floor(24 - hoursAgo)))]?.push(source)
  }
  const rows = compact ? 3 : Math.max(2, Math.min(4, Math.max(...cells.map((cell) => cell.length))))
  const cited = new Set(sources.filter((s) => s.citedInSummary).map((s) => s.publisher.id)).size
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${plural(new Set(sources.map((s) => s.publisher.id)).size, 'publisher')} by hour, ${cited} cited`}
      style={compact ? styles.compact : undefined}
    >
      <View style={styles.cells} aria-hidden>
        {cells.map((cell, index) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed hour slots
            key={index}
            style={[styles.cell, { borderColor: color, height: compact ? 24 : rows * 9 + 4 }]}
          >
            {cell.slice(0, cell.length > rows ? rows - 1 : rows).map((source) => (
              <View
                key={source.articleId}
                style={[
                  styles.dot,
                  compact && styles.dotCompact,
                  {
                    borderColor: color,
                    backgroundColor: source.citedInSummary ? color : undefined,
                  },
                ]}
              />
            ))}
            {cell.length > rows ? <Text style={[styles.more, { color }]}>+</Text> : null}
          </View>
        ))}
      </View>
      {!compact ? (
        <View style={styles.axis} aria-hidden>
          {[24, 18, 12, 6, 0].map((hour) => (
            <Text key={hour} style={[styles.label, { color }]}>
              {hour === 0
                ? end === nowMs
                  ? 'now'
                  : formatDate(new Date(end).toISOString())
                : clockTime(new Date(end - hour * HOUR).toISOString())}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  compact: { flexBasis: 168, flexShrink: 1 },
  cells: { flexDirection: 'row' },
  cell: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingVertical: 2,
    gap: 2,
  },
  dot: { width: 6, height: 6, borderRadius: 3, borderWidth: 1 },
  dotCompact: { width: 4, height: 4, borderRadius: 2 },
  more: { fontSize: 8, lineHeight: 8, fontFamily: t.font.bold },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: t.space[1] },
  label: { fontFamily: t.font.semibold, fontSize: 10 },
})
