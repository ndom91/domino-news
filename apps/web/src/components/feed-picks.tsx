import { savePreferencesMutation } from '@dn/queries'
import { DESK_LABELS, DESKS, type Desk, REGION_LABELS, REGIONS, type Region } from '@dn/schemas'
import { cx, Notice } from '@dn/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, queries } from '../lib/api.ts'

const toggle = <T,>(list: readonly T[], item: T) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item]

function Chips<T extends string>({
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
      <legend className="mb-2 type-label">{label}</legend>
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

/** Regions and desks that rank Stories up on For You. Each tap saves. */
export function FeedPicks() {
  const queryClient = useQueryClient()
  const prefs = useQuery(queries.preferences())
  const save = useMutation(savePreferencesMutation(api, queryClient))
  const regions = prefs.data?.regions ?? []
  const desks = prefs.data?.desks ?? []
  const busy = prefs.isPending || save.isPending
  return (
    <div className="flex flex-col gap-6">
      <Chips
        label="Regions"
        options={REGIONS}
        labelOf={(r: Region) => REGION_LABELS[r]}
        selected={regions}
        disabled={busy}
        onToggle={(r) => save.mutate({ regions: toggle(regions, r) })}
      />
      <Chips
        label="Desks"
        options={DESKS}
        labelOf={(d: Desk) => DESK_LABELS[d]}
        selected={desks}
        disabled={busy}
        onToggle={(d) => save.mutate({ desks: toggle(desks, d) })}
      />
      {save.isError ? (
        <Notice tone="error" title="Not saved">
          {save.error.message}
        </Notice>
      ) : null}
    </div>
  )
}
