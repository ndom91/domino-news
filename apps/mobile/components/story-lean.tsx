import { nativeTokens as t } from '@dn/design-tokens/native'
import { combinedStoryLean, plural } from '@dn/domain'
import { LEAN_LABELS, type PublisherLean, type StoryLean } from '@dn/schemas'
import { StyleSheet, Text, View } from 'react-native'
import { SectionHeading } from './story-detail/section-heading'

const leans: PublisherLean[] = ['left', 'centre_left', 'centre', 'centre_right', 'right']

const colors: Record<PublisherLean, string> = {
  left: t.color.lean.left,
  centre_left: t.color.lean.centreLeft,
  centre: t.color.lean.centre,
  centre_right: t.color.lean.centreRight,
  right: t.color.lean.right,
}

export function StoryLeanMeter({ mix }: { mix: StoryLean[] }) {
  const main = combinedStoryLean(mix)
  if (!main) return null

  return (
    <View style={styles.section}>
      <SectionHeading>Political lean</SectionHeading>
      <LeanSpread lean={main} />
      <Text style={styles.note}>
        This is a shared scale. Each assessment retains its country context and evidence. Estimates
        are marked and never determine one-sided coverage.
      </Text>
    </View>
  )
}

function LeanSpread({ lean }: { lean: StoryLean }) {
  const rated = ratedCount(lean)
  const estimated = lean.publishers.filter(
    (publisher) => publisher.lean && publisher.estimated,
  ).length
  const groups = leans.map((key) => ({
    key,
    publishers: lean.publishers.filter((publisher) => publisher.lean === key),
  }))
  const unrated = lean.publishers.filter((publisher) => publisher.lean === null)

  return (
    <View style={styles.spread}>
      <View style={styles.spreadHeading}>
        <Text style={styles.country}>Covering publishers</Text>
        <Text style={styles.count}>
          {rated} of {plural(lean.publishers.length, 'publisher')} rated
          {estimated ? `, ${estimated} estimated` : ''}
        </Text>
      </View>
      <View accessible accessibilityLabel={barLabel(groups, unrated.length)} style={styles.bar}>
        {groups.map((group) =>
          group.publishers.length ? (
            <View
              key={group.key}
              style={[
                styles.segment,
                { backgroundColor: colors[group.key], flex: group.publishers.length },
              ]}
            />
          ) : null,
        )}
        {unrated.length ? (
          <View style={[styles.segment, styles.unrated, { flex: unrated.length }]} />
        ) : null}
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.axis}
      >
        <Text style={styles.axisText}>Left</Text>
        <Text style={styles.axisText}>Right</Text>
      </View>
      <View style={styles.rows}>
        {groups.map((group) => (
          <LeanRow
            key={group.key}
            label={LEAN_LABELS[group.key]}
            publishers={group.publishers}
            color={colors[group.key]}
          />
        ))}
        {unrated.length ? <LeanRow label="Not rated" publishers={unrated} unrated /> : null}
      </View>
      {lean.oneSided ? (
        <Text style={styles.oneSided}>
          Most publishers with sourced ratings lean {lean.oneSided}.
        </Text>
      ) : null}
    </View>
  )
}

function LeanRow({
  color,
  label,
  publishers,
  unrated = false,
}: {
  color?: string
  label: string
  publishers: StoryLean['publishers']
  unrated?: boolean
}) {
  return (
    <View style={[styles.row, publishers.length === 0 ? styles.rowEmpty : null]}>
      <View style={styles.rowLabel}>
        <View style={[styles.swatch, color ? { backgroundColor: color } : styles.unrated]} />
        <Text style={styles.rowText}>{label}</Text>
      </View>
      <Text style={styles.rowCount}>{publishers.length}</Text>
      <Text style={styles.publisherNames}>
        {publishers
          .map((entry) => `${entry.publisher.name}${entry.estimated ? ' (estimated)' : ''}`)
          .join(', ') || (unrated ? 'No publisher rated' : '')}
      </Text>
    </View>
  )
}

function ratedCount(lean: StoryLean) {
  return lean.publishers.filter((publisher) => publisher.lean !== null).length
}

function barLabel(
  groups: { key: PublisherLean; publishers: StoryLean['publishers'] }[],
  unrated: number,
) {
  const labels = groups
    .filter((group) => group.publishers.length)
    .map((group) => `${LEAN_LABELS[group.key]}: ${group.publishers.length}`)
  if (unrated) labels.push(`Not rated: ${unrated}`)
  return labels.join(', ')
}

const styles = StyleSheet.create({
  section: { gap: t.space[3], marginTop: t.space[10] },
  spread: { gap: t.space[2] },
  spreadHeading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: t.space[1],
    justifyContent: 'space-between',
  },
  country: { color: t.color.textMuted, fontFamily: t.font.bold, fontSize: t.type.meta },
  count: { color: t.color.textSecondary, fontFamily: t.font.medium, fontSize: t.type.meta },
  bar: { flexDirection: 'row', gap: 2, height: 12 },
  segment: { minWidth: 4 },
  unrated: {
    backgroundColor: t.color.surface,
    borderColor: t.color.lean.unrated,
    borderWidth: 1,
  },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -t.space[1] },
  axisText: { color: t.color.textMuted, fontFamily: t.font.medium, fontSize: 11 },
  rows: { gap: t.space[1], marginTop: t.space[1] },
  row: { alignItems: 'center', flexDirection: 'row', gap: t.space[2], minHeight: 24 },
  rowEmpty: { opacity: 0.55 },
  rowLabel: { alignItems: 'center', flexDirection: 'row', gap: t.space[2], width: 116 },
  swatch: { height: 12, width: 12 },
  rowText: { color: t.color.text, fontFamily: t.font.medium, fontSize: t.type.meta },
  rowCount: {
    color: t.color.text,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    textAlign: 'right',
    width: 18,
  },
  publisherNames: {
    color: t.color.textSecondary,
    flex: 1,
    fontFamily: t.font.regular,
    fontSize: t.type.meta,
    lineHeight: 18,
  },
  oneSided: {
    borderLeftColor: t.color.rule,
    borderLeftWidth: 2,
    color: t.color.text,
    fontFamily: t.font.bold,
    fontSize: t.type.body,
    lineHeight: 22,
    marginTop: t.space[2],
    paddingLeft: t.space[3],
  },
  note: {
    color: t.color.textMuted,
    fontFamily: t.font.regular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: t.space[1],
  },
})
