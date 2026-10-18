import { nativeTokens as t } from '@dn/design-tokens/native'
import { countryName, LEAN_MIX_MIN_RATED, plural } from '@dn/domain'
import { LEAN_LABELS, type PublisherLean, type StoryLean } from '@dn/schemas'
import { StyleSheet, Text, View } from 'react-native'

const leans: PublisherLean[] = ['left', 'centre_left', 'centre', 'centre_right', 'right']

const colors: Record<PublisherLean, string> = {
  left: t.color.lean.left,
  centre_left: t.color.lean.centreLeft,
  centre: t.color.lean.centre,
  centre_right: t.color.lean.centreRight,
  right: t.color.lean.right,
}

export function StoryLeanMeter({ mix, country }: { mix: StoryLean[]; country: string | null }) {
  if (mix.length === 0) return null

  const shown = mix.filter((entry) => ratedCount(entry) >= LEAN_MIX_MIN_RATED)
  const thin = mix.filter((entry) => ratedCount(entry) < LEAN_MIX_MIN_RATED)
  const main = shown.find((entry) => entry.country === country) ?? shown[0]
  const others = shown.filter((entry) => entry !== main)
  const publisherCount = mix.reduce((total, entry) => total + entry.publishers.length, 0)

  return (
    <View style={styles.section}>
      <Text style={styles.label}>Political lean</Text>
      {main ? (
        <LeanSpread lean={main} />
      ) : (
        <Text style={styles.empty}>
          Not enough of the {plural(publisherCount, 'publisher')} here have a reviewed lean yet.
        </Text>
      )}
      {others.map((entry) => (
        <LeanSpread compact key={entry.country} lean={entry} />
      ))}
      <Text style={styles.note}>
        Each publisher’s lean is relative to its own country’s media and comes from reviewed
        assessments.
        {main && thin.length
          ? ` Too few rated publishers to show: ${thin.map((entry) => countryName(entry.country)).join(', ')}.`
          : ''}
      </Text>
    </View>
  )
}

function LeanSpread({ lean, compact = false }: { lean: StoryLean; compact?: boolean }) {
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
    <View style={[styles.spread, compact ? styles.compactSpread : null]}>
      <View style={styles.spreadHeading}>
        <Text style={styles.country}>Publishers in {countryName(lean.country)}</Text>
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
      {!compact ? (
        <>
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
              Mostly covered by {lean.oneSided}-leaning publishers in {countryName(lean.country)}
            </Text>
          ) : null}
        </>
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
  label: {
    color: t.color.text,
    fontFamily: t.font.black,
    fontSize: t.type.body,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  empty: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 22,
  },
  spread: { gap: t.space[2] },
  compactSpread: {
    borderTopColor: t.color.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: t.space[4],
  },
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
