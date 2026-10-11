import { cx } from '../cx.ts'

export interface MixEntry {
  key: string
  label: string
  /** This outlet's share, 0-1. */
  share: number
  /** Share across all outlets, 0-1. */
  overallShare: number
  /** Fill utility for the bar (e.g. a desk key); defaults to ink. */
  fillClass?: string
}

const pct = (n: number) => `${Math.round(n * 100)}%`

/**
 * One outlet's mix against everyone: a bar for the outlet, an accent tick for all outlets.
 * Values are labelled on every row; hover adds the difference in points (also given to
 * screen readers), so the hover layer never holds anything the row doesn't.
 */
export function MixBars({
  title,
  entries,
  className,
}: {
  title: string
  entries: MixEntry[]
  className?: string
}) {
  const max = Math.max(0.01, ...entries.flatMap((e) => [e.share, e.overallShare]))
  const scale = (n: number) => `${(n / max) * 100}%`
  return (
    <figure className={className}>
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="type-label text-text-muted">{title}</span>
        <span className="flex items-center gap-3 type-meta" aria-hidden>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-4 border border-text" />
            This outlet
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-0.5 bg-accent" />
            All outlets
          </span>
        </span>
      </figcaption>
      <ul className="flex flex-col">
        {entries.map((e) => {
          const diff = Math.round((e.share - e.overallShare) * 100)
          return (
            <li
              key={e.key}
              className="group grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 py-1.5 text-sm hover:bg-text/5"
            >
              <span className="truncate">{e.label}</span>
              <span className="relative h-3" aria-hidden>
                <span
                  className={cx('absolute inset-y-0 left-0', e.fillClass ?? 'bg-text')}
                  style={{ width: scale(e.share) }}
                />
                <span
                  className="absolute -inset-y-1 w-0.5 -translate-x-1/2 bg-accent"
                  style={{ left: scale(e.overallShare) }}
                />
              </span>
              <span className="text-right whitespace-nowrap">
                <span className="font-bold">{pct(e.share)}</span>
                <span className="text-text-muted"> · all {pct(e.overallShare)}</span>
                <span className="sr-only text-text-secondary group-hover:not-sr-only">
                  {' '}
                  ({diff > 0 ? '+' : ''}
                  {diff} pts)
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </figure>
  )
}
