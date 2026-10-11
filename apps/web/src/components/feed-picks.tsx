import { savePreferencesMutation } from '@dn/queries'
import {
  DESK_LABELS,
  DESKS,
  type Desk,
  REGION_LABELS,
  REGIONS,
  type Region,
  TOPIC_DESK,
  TOPIC_LABELS,
  TOPICS,
  type Topic,
} from '@dn/schemas'
import { cx, Notice } from '@dn/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, queries } from '../lib/api.ts'

const toggle = <T,>(list: readonly T[], item: T) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item]

export function Chips<T extends string>({
  label,
  options,
  selected,
  disabled,
  onToggle,
  labelOf,
}: {
  label: string
  options: readonly T[]
  labelOf: (value: T) => string
  selected: readonly T[]
  disabled: boolean
  onToggle: (value: T) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 type-label text-text-muted">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = selected.includes(o)
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onToggle(o)}
              className={cx(
                'min-h-tap border px-3 text-sm font-semibold',
                on
                  ? 'border-text bg-text text-canvas'
                  : 'border-border-strong text-text-secondary hover:text-text',
              )}
            >
              {labelOf(o)}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

type Section = 'regions' | 'desks' | 'topics'

/** Regions, desks and topics that rank Stories up on For You. Each tap saves. */
export function FeedPicks({
  sections,
}: {
  /** Which pickers to show; onboarding shows them a step at a time. */
  sections: readonly Section[]
}) {
  const queryClient = useQueryClient()
  const prefs = useQuery(queries.preferences())
  const save = useMutation(savePreferencesMutation(api, queryClient))
  const regions = prefs.data?.regions ?? []
  const desks = prefs.data?.desks ?? []
  const topics = prefs.data?.topics ?? []
  const busy = prefs.isPending || save.isPending
  return (
    <div className="flex flex-col gap-6">
      {sections.includes('regions') ? (
        <Chips
          label="Regions"
          options={REGIONS}
          labelOf={(r: Region) => REGION_LABELS[r]}
          selected={regions}
          disabled={busy}
          onToggle={(r) => save.mutate({ regions: toggle(regions, r) })}
        />
      ) : null}
      {sections.includes('desks') ? (
        <Chips
          label="Desks"
          options={DESKS}
          labelOf={(d: Desk) => DESK_LABELS[d]}
          selected={desks}
          disabled={busy}
          onToggle={(d) => save.mutate({ desks: toggle(desks, d) })}
        />
      ) : null}
      {sections.includes('topics') ? (
        <div className="flex flex-col gap-4">
          <p className="type-label">Topics</p>
          {DESKS.map((d) => (
            <Chips
              key={d}
              label={DESK_LABELS[d]}
              options={TOPICS.filter((t) => TOPIC_DESK[t] === d)}
              labelOf={(t: Topic) => TOPIC_LABELS[t]}
              selected={topics}
              disabled={busy}
              onToggle={(t) => save.mutate({ topics: toggle(topics, t) })}
            />
          ))}
        </div>
      ) : null}
      {save.isError ? (
        <Notice tone="error" title="Not saved">
          {save.error.message}
        </Notice>
      ) : null}
    </div>
  )
}
