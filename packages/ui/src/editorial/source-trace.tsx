import { formatDate } from '@dn/domain'
import { cx } from '../cx.ts'

export interface TraceSource {
  id: string
  publisherName: string
  at: string
  /** Cited by the current summary. */
  cited?: boolean
}

/**
 * Signature element: every outlet that reported a Story, placed on a time axis at the
 * moment it reported. Filled marks were cited by the summary; hollow marks were observed
 * but not cited. Encodes coverage and grounding, never credibility.
 */
export function SourceTrace({
  sources,
  size = 'compact',
  className,
}: {
  sources: TraceSource[]
  size?: 'compact' | 'full'
  className?: string
}) {
  if (sources.length === 0) return null
  const times = sources.map((s) => new Date(s.at).getTime())
  const min = Math.min(...times)
  const max = Math.max(...times)
  const span = Math.max(max - min, 1)
  const position = (t: number) => (sources.length === 1 ? 0 : ((t - min) / span) * 100)
  const outlets = new Set(sources.map((s) => s.publisherName)).size
  const label = `Reported by ${outlets} outlet${outlets === 1 ? '' : 's'}${
    sources.length > 1
      ? ` between ${formatDate(new Date(min).toISOString())} and ${formatDate(new Date(max).toISOString())}`
      : ''
  }`

  if (size === 'compact') {
    return (
      <div className={cx('flex items-center gap-3', className)}>
        <div role="img" aria-label={label} className="relative h-3 w-24 shrink-0 sm:w-32">
          <span className="absolute inset-x-0 top-1/2 h-px bg-border-strong" />
          {sources.map((s) => (
            <span
              key={s.id}
              style={{ left: `${position(new Date(s.at).getTime())}%` }}
              className={cx(
                'absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full',
                s.cited === false ? 'border border-text-muted bg-canvas' : 'bg-text',
              )}
            />
          ))}
        </div>
        <span className="font-mono text-xs text-text-muted">
          {outlets} {outlets === 1 ? 'source' : 'sources'}
        </span>
      </div>
    )
  }

  // Full: a dot plot, one row per report on a shared time axis. Rows link to the source list.
  const ordered = [...sources].sort((a, b) => a.at.localeCompare(b.at))
  return (
    <figure className={cx('w-full', className)} aria-label={label}>
      <div className="mb-2 grid grid-cols-[minmax(6rem,9rem)_1fr] gap-x-3 font-mono text-2xs text-text-muted">
        <span />
        <span className="flex justify-between">
          <span>{formatDate(new Date(min).toISOString())}</span>
          {sources.length > 1 ? <span>{formatDate(new Date(max).toISOString())}</span> : null}
        </span>
      </div>
      <ol className="flex flex-col">
        {ordered.map((s) => (
          <li key={s.id}>
            <a
              href={`#source-${s.id}`}
              className="group grid grid-cols-[minmax(6rem,9rem)_1fr] items-center gap-x-3 rounded-sm py-1 hover:bg-sunken"
            >
              <span className="truncate text-xs text-text-secondary group-hover:text-text">
                {s.publisherName}
              </span>
              <span className="relative h-3">
                <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
                <span
                  style={{ left: `${position(new Date(s.at).getTime())}%` }}
                  className={cx(
                    'absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full',
                    s.cited === false ? 'border-2 border-text-muted bg-canvas' : 'bg-text',
                  )}
                />
              </span>
            </a>
          </li>
        ))}
      </ol>
      <figcaption className="mt-2 text-xs text-text-muted">
        {label}. Filled marks are cited in the summary; hollow marks were observed but not cited.
      </figcaption>
    </figure>
  )
}
