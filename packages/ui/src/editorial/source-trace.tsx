import { clockTime, formatDate, formatDateTime } from '@dn/domain'
import { cx } from '../cx.ts'

export interface TraceSource {
  id: string
  outlet: string
  at: string
  /** Citation number in the summary; null if reported but not cited (0 = cited, unnumbered). */
  citation: number | null
}

const citationLabel = (n: number | null) =>
  n === null ? 'reported, not cited' : n ? `cited [${n}]` : 'cited'

const HOUR = 3_600_000
const CELLS = 24

/**
 * Hour-cell Source Trace: 24 cells ending at `now` (or at the latest report if everything is
 * older). Each outlet is a mark in the hour it reported: filled if cited, ring if only reported.
 * Shape carries the meaning, not colour. `onKey` switches to the hero's key-text colour.
 */
export function SourceTrace({
  sources,
  variant = 'compact',
  now,
  width = variant === 'full' ? 492 : 216,
  onKey = false,
  className,
}: {
  sources: TraceSource[]
  variant?: 'compact' | 'full'
  /** Window end; pass a server-provided time so SSR and the client agree. */
  now: string
  width?: number
  onKey?: boolean
  className?: string
}) {
  const latest = Math.max(...sources.map((s) => Date.parse(s.at)))
  const nowMs = Date.parse(now)
  const end = latest < nowMs - CELLS * HOUR ? latest : nowMs
  const stale = end !== nowMs
  const cw = width / CELLS
  const r = Math.min(3.8, cw / 2 - 1.3)
  const rh = r * 2 + 3
  const columns = Array.from({ length: CELLS }, () => [] as TraceSource[])
  for (const s of sources) {
    const hoursAgo = (end - Date.parse(s.at)) / HOUR
    const cell = Math.min(CELLS - 1, Math.max(0, Math.floor(CELLS - hoursAgo)))
    columns[cell]?.push(s)
  }
  for (const col of columns)
    col.sort((a, b) => Number(b.citation !== null) - Number(a.citation !== null))
  const rows = Math.max(variant === 'full' ? 2 : 3, ...columns.map((c) => c.length))
  const h = rows * rh + 4
  const H = h + (variant === 'full' ? 18 : 0)
  const cited = sources.filter((s) => s.citation !== null).length
  const label = (hoursAgo: number) => {
    const at = new Date(end - hoursAgo * HOUR).toISOString()
    if (hoursAgo === 0) return stale ? formatDate(at) : 'now'
    return stale ? `${formatDate(at)} ${clockTime(at)}` : clockTime(at)
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${H}`}
      width={width}
      height={H}
      role="img"
      aria-label={`${sources.length} outlets by hour, ${cited} cited`}
      className={cx('block h-auto max-w-full', className)}
    >
      {columns.map((_, i) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: cells are fixed hour slots
          key={i}
          x={i * cw + 0.5}
          y={0.5}
          width={cw - 1}
          height={h - 1}
          className={cx('fill-none', onKey ? 'stroke-key-text/40' : 'stroke-trace-cell')}
        />
      ))}
      {columns.flatMap((col, i) =>
        col.map((s, j) => (
          <circle
            key={s.id}
            cx={i * cw + cw / 2}
            cy={h - 2 - rh / 2 - j * rh}
            r={r}
            strokeWidth={s.citation === null ? 1.5 : 0}
            className={
              s.citation === null
                ? onKey
                  ? 'fill-key stroke-key-text'
                  : 'fill-canvas stroke-trace-observed'
                : onKey
                  ? 'fill-key-text'
                  : 'fill-trace-cited'
            }
          >
            {/* One string: React SSR drops multi-part text inside an SVG <title>. */}
            <title>{`${s.outlet} · ${citationLabel(s.citation)} · ${formatDateTime(s.at)}`}</title>
          </circle>
        )),
      )}
      {variant === 'full'
        ? [24, 18, 12, 6, 0].map((hr) => (
            <text
              key={hr}
              x={(CELLS - hr) * cw}
              y={h + 14}
              textAnchor={hr === 24 ? 'start' : hr === 0 ? 'end' : 'middle'}
              className={cx('text-2xs font-semibold', onKey ? 'fill-key-text' : 'fill-text-muted')}
            >
              {label(hr)}
            </text>
          ))
        : null}
    </svg>
  )
}
