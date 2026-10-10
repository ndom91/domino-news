import { clockTime, formatDate, formatDateTime } from '@dn/domain'
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
 * only reported. The accessible counterpart of the Source Trace.
 */
export function SourceBoard({
  sources,
  onKey = false,
}: {
  sources: BoardSource[]
  onKey?: boolean
}) {
  const ordered = [...sources].sort((a, b) => a.at.localeCompare(b.at))
  return (
    <>
      <ol className={cx('mt-5 border-t-2', onKey ? 'border-key-text' : 'border-rule')}>
        {ordered.map((s) => (
          <li
            key={s.id}
            id={`source-${s.id}`}
            className={cx(
              'grid min-h-12 grid-cols-[4.75rem_minmax(0,1fr)_2.5rem] items-center border-b max-md:grid-cols-[4rem_minmax(0,1fr)_2.5rem]',
              onKey ? 'border-key-text/30' : 'border-border',
            )}
          >
            <time
              dateTime={s.at}
              title={formatDateTime(s.at)}
              className={cx('type-numeral', s.citation === null && 'opacity-75')}
            >
              {clockTime(s.at)}
            </time>
            <a
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className={cx(
                'min-w-0 py-1.5 text-[1rem] font-semibold hover:underline',
                s.citation === null && 'opacity-75',
              )}
            >
              <span className="block truncate">{s.outlet}</span>
              <small className="block text-xs font-medium opacity-80">{formatDate(s.at)}</small>
            </a>
            <span className="sr-only">
              {s.citation === null
                ? 'Reported, not cited'
                : `Cited${s.citation ? ` as source ${s.citation}` : ''}`}
            </span>
            <span
              aria-hidden
              className={cx(
                'inline-grid h-6 w-8 place-items-center justify-self-end text-sm font-extrabold',
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
