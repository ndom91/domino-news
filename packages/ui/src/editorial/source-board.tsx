import { clockTime, formatDate } from '@dn/domain'
import { cx } from '../cx.ts'

export interface BoardSource {
  id: string
  outlet: string
  at: string
  href: string
  /** null = reported but not cited; 0 = cited without a number (older summaries). */
  citation: number | null
}

/**
 * "Who reported it": one row per outlet in publishing order. Time, outlet (links to the
 * original article) and a marker: solid box with the citation number, or an outline box if
 * only reported. The accessible counterpart of the Source Trace, sharing its hover state.
 */
export function SourceBoard({
  sources,
  onKey = false,
  active = null,
  onActiveChange,
}: {
  sources: BoardSource[]
  onKey?: boolean
  active?: string | null
  onActiveChange?: (id: string | null) => void
}) {
  const ordered = [...sources].sort((a, b) => a.at.localeCompare(b.at))
  const muted = onKey ? 'text-key-text-muted' : 'text-text-muted'
  return (
    <>
      <ol className={cx('mt-5 border-t-2', onKey ? 'border-key-text' : 'border-rule')}>
        {ordered.map((s) => (
          <li
            key={s.id}
            id={`source-${s.id}`}
            data-active={active === s.id || undefined}
            onPointerEnter={() => onActiveChange?.(s.id)}
            onPointerLeave={() => onActiveChange?.(null)}
            className={cx(
              // Hover tint on a pseudo-element, so only opacity animates. The outline marks
              // the row a citation marker jumped to.
              'relative isolate before:absolute before:inset-0 before:-z-10 before:bg-current/12 before:opacity-0 before:transition-opacity data-active:before:opacity-100',
              'grid min-h-12 scroll-mt-24 grid-cols-[4.75rem_minmax(0,1fr)_2.5rem] items-center border-b target:outline-2 target:outline-current max-md:grid-cols-[4rem_minmax(0,1fr)_2.5rem]',
              onKey ? 'border-key-text/30' : 'border-border',
            )}
          >
            <time dateTime={s.at} className={cx('type-numeral', s.citation === null && muted)}>
              {clockTime(s.at)}
            </time>
            <a
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cx(
                'min-w-0 py-1.5 text-[1rem] font-semibold hover:underline',
                s.citation === null && muted,
              )}
            >
              <span className="block truncate">{s.outlet}</span>
              <small className={cx('block text-xs font-medium', muted)}>{formatDate(s.at)}</small>
            </a>
            <span className="sr-only">
              {s.citation === null
                ? 'Reported, not cited'
                : `Cited${s.citation ? ` as source ${s.citation}` : ''}`}
            </span>
            <span
              aria-hidden
              className={cx(
                // Not inline-grid: with our `grid` spacing key, Tailwind also reads that as
                // inline-size: var(--spacing-grid), which squeezes the box on small screens.
                'grid h-6 w-8 place-items-center justify-self-end text-sm font-extrabold',
                s.citation === null
                  ? onKey
                    ? 'shadow-[inset_0_0_0_2px_var(--dn-key-text)]'
                    : 'shadow-[inset_0_0_0_2px_var(--dn-text)]'
                  : onKey
                    ? 'bg-key-text text-key'
                    : 'bg-text text-canvas',
              )}
            >
              {s.citation || ''}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-3.5 flex flex-wrap gap-x-4.5 gap-y-1 text-sm font-semibold">
        <span className="inline-flex items-center gap-2">
          <i aria-hidden className="h-[11px] w-3.5 bg-current" />
          Cited in summary
        </span>
        <span className="inline-flex items-center gap-2">
          <i aria-hidden className="h-[11px] w-3.5 shadow-[inset_0_0_0_2px_currentColor]" />
          Reported, not cited
        </span>
      </div>
    </>
  )
}
