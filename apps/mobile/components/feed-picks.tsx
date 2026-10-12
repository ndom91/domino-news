import { nativeTokens as t } from '@dn/design-tokens/native'
import {
  DESK_LABELS,
  DESK_SLOT,
  DESKS,
  type Desk,
  REGION_LABELS,
  REGIONS,
  type Region,
  TOPIC_DESK,
  TOPIC_LABELS,
  TOPICS,
  type Topic,
  type UserPreferencesUpdate,
} from '@dn/schemas'
import { Pressable, StyleSheet, Text, View } from 'react-native'

export type FeedPickSection = 'regions' | 'desks' | 'topics'

type FeedPickValues = {
  regions: readonly Region[]
  desks: readonly Desk[]
  topics: readonly Topic[]
}

/** Controlled For You preference pickers. Saving is owned by the screen. */
export function FeedPicks({
  sections,
  values,
  disabled,
  onChange,
}: {
  sections: readonly FeedPickSection[]
  values: FeedPickValues
  disabled: boolean
  onChange: (update: Pick<UserPreferencesUpdate, 'regions' | 'desks' | 'topics'>) => void
}) {
  return (
    <View style={styles.container}>
      {sections.includes('regions') ? (
        <ChipPicker
          disabled={disabled}
          label="Regions"
          onToggle={(region) => onChange({ regions: toggle(values.regions, region) })}
          options={REGIONS}
          selected={values.regions}
          titleFor={(region) => REGION_LABELS[region]}
        />
      ) : null}
      {sections.includes('desks') ? (
        <ChipPicker
          disabled={disabled}
          label="Desks"
          onToggle={(desk) => onChange({ desks: toggle(values.desks, desk) })}
          options={DESKS}
          selected={values.desks}
          textColorFor={(desk) => t.color.narrativeText[DESK_SLOT[desk]] ?? t.color.bandText}
          tintFor={(desk) => t.color.narrative[DESK_SLOT[desk]] ?? t.color.accent}
          titleFor={(desk) => DESK_LABELS[desk]}
        />
      ) : null}
      {sections.includes('topics') ? (
        <View style={styles.topicSection}>
          <Text style={styles.groupLabel}>Topics</Text>
          {DESKS.map((desk) => (
            <ChipPicker
              disabled={disabled}
              key={desk}
              label={DESK_LABELS[desk]}
              onToggle={(topic) => onChange({ topics: toggle(values.topics, topic) })}
              options={TOPICS.filter((topic) => TOPIC_DESK[topic] === desk)}
              selected={values.topics}
              textColorFor={() => t.color.narrativeText[DESK_SLOT[desk]] ?? t.color.bandText}
              tintFor={() => t.color.narrative[DESK_SLOT[desk]] ?? t.color.accent}
              titleFor={(topic) => TOPIC_LABELS[topic]}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

export function ChipPicker<T extends string>({
  disabled,
  label,
  onToggle,
  options,
  selected,
  textColorFor,
  tintFor,
  titleFor,
}: {
  disabled: boolean
  label: string
  onToggle: (value: T) => void
  options: readonly T[]
  selected: readonly T[]
  textColorFor?: (value: T) => string
  tintFor?: (value: T) => string
  titleFor: (value: T) => string
}) {
  return (
    <View style={styles.pickGroup}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const picked = selected.includes(option)
          const tint = tintFor?.(option)
          const title = titleFor(option)
          return (
            <Pressable
              accessibilityLabel={`${picked ? 'Remove' : 'Add'} ${title}`}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected: picked }}
              disabled={disabled}
              key={option}
              onPress={() => onToggle(option)}
              style={({ pressed }) => [
                styles.chip,
                picked ? styles.chipSelected : null,
                picked && tint ? { backgroundColor: tint } : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  picked ? styles.chipTextSelected : null,
                  picked && textColorFor ? { color: textColorFor(option) } : null,
                ]}
              >
                {title}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function toggle<T>(items: readonly T[], item: T): T[] {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item]
}

const styles = StyleSheet.create({
  container: { gap: t.space[4] },
  topicSection: { gap: t.space[4] },
  pickGroup: { gap: t.space[2] },
  groupLabel: {
    color: t.color.textMuted,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] },
  chip: {
    borderColor: t.color.borderStrong,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: t.size.tap,
    paddingHorizontal: t.space[3],
  },
  chipSelected: { backgroundColor: t.color.band, borderColor: t.color.band },
  chipText: { color: t.color.textSecondary, fontFamily: t.font.bold, fontSize: t.type.meta },
  chipTextSelected: { color: t.color.bandText },
  pressed: { opacity: 0.68 },
})
