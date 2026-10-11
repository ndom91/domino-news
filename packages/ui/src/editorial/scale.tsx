import { cx } from '../cx.ts'

type Tone = 'success' | 'warning' | 'error'

// Literal class names so Tailwind generates them.
const TONE = {
  success: { fill: 'bg-success', track: 'bg-success-subtle', text: 'text-success', icon: '✓' },
  warning: { fill: 'bg-warning', track: 'bg-warning-subtle', text: 'text-warning', icon: '!' },
  error: { fill: 'bg-error', track: 'bg-error-subtle', text: 'text-error', icon: '✕' },
} as const

// Hatching for "no value": shape, not colour, says it's empty.
const HATCH = {
  backgroundImage: 'repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 6px)',
}

/**
 * Ordinal state as a stepped scale: one segment per step, best first. The active step is
 * filled in its status colour and named with an icon + label, so colour is never alone.
 */
export function StatusScale<T extends string>({
  steps,
  value,
  emptyLabel = 'Not rated',
  className,
}: {
  steps: readonly { key: T; label: string; tone: Tone }[]
  value: T | null
  emptyLabel?: string
  className?: string
}) {
  const active = steps.find((s) => s.key === value)
  return (
    <div className={className}>
      <div className="flex gap-0.5" aria-hidden>
        {steps.map((s) => (
          <span
            key={s.key}
            className={cx(
              'h-3 flex-1',
              !active
                ? 'text-border-strong'
                : s.key === value
                  ? TONE[s.tone].fill
                  : TONE[s.tone].track,
            )}
            style={active ? undefined : HATCH}
          />
        ))}
      </div>
      <p className={cx('mt-2 font-bold', active ? TONE[active.tone].text : 'text-text-muted')}>
        {active ? (
          <>
            <span aria-hidden className="mr-1.5">
              {TONE[active.tone].icon}
            </span>
            {active.label}
          </>
        ) : (
          emptyLabel
        )}
      </p>
    </div>
  )
}

/**
 * A position on an ordered axis (political lean). `stepFills` colours each tick and the
 * marked dot; without it they are ink. With no value the track is hatched and nothing is
 * marked.
 */
export function PositionScale({
  steps,
  value,
  startLabel,
  endLabel,
  emptyLabel = 'Not assessed',
  stepFills,
  className,
}: {
  steps: readonly string[]
  /** One background class per step, e.g. `bg-lean-left`. */
  stepFills?: readonly string[]
  value: number | null
  startLabel: string
  endLabel: string
  emptyLabel?: string
  className?: string
}) {
  const hasValue = value !== null && value >= 0 && value < steps.length
  return (
    <div className={className}>
      <div className="relative h-3" aria-hidden>
        <span
          className={cx(
            'absolute inset-x-0 top-1/2 -translate-y-1/2',
            hasValue ? 'h-0.5 bg-text' : 'h-3 text-border-strong',
          )}
          style={hasValue ? undefined : HATCH}
        />
        {hasValue
          ? steps.map((s, i) => (
              <span
                key={s}
                className={cx(
                  'absolute top-1/2 -translate-x-1/2 -translate-y-1/2',
                  i === value ? 'size-4 border-2 border-text' : 'h-3 w-1',
                  stepFills?.[i] ?? 'bg-text',
                )}
                style={{ left: `${(i / (steps.length - 1)) * 100}%` }}
              />
            ))
          : null}
      </div>
      <div className="mt-1.5 flex justify-between type-meta" aria-hidden>
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
      <p className={cx('mt-1 font-bold', hasValue ? 'text-text' : 'text-text-muted')}>
        {hasValue ? steps[value] : emptyLabel}
      </p>
    </div>
  )
}
