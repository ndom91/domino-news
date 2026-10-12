import { clockTime, formatDate, formatDateTime, plural } from '@dn/domain'
import { useRef, useState } from 'react'
import { cx } from '../cx.ts'
import { Tooltip } from '../primitives/overlay.tsx'
import { useWidth } from '../primitives/use-width.ts'

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
const R = 3.8
// Row height comes from the largest mark, not the cell width, so the trace keeps its height
// when a 'fill' trace is measured after hydration (no layout shift).
const RH = R * 2 + 3

/**
 * 24 hour cells ending at `now` (or the latest report if older), one mark per outlet: filled if
 * cited, ring if only reported. `active`/`onActiveChange` share the hovered mark with a sibling.
 */
export function SourceTrace({
  sources,
  variant = 'compact',
  now,
  width: widthProp = variant === 'full' ? 492 : 216,
  rows: fixedRows,
  onKey = false,
  active,
  onActiveChange,
}: {
  sources: TraceSource[]
  variant?: 'compact' | 'full'
  /** Window end; pass a server-provided time so SSR and the client agree. */
  now: string
  /** Pixels, or 'fill' to span the container (redrawn on resize; cells widen, marks don't). */
  width?: number | 'fill'
  /**
   * Fixed height in marks, so neighbouring cards line up. A busier hour shows rows-1 marks
   * and a "+" (with the rest in its tooltip). Omit to grow with the data.
   */
  rows?: number
  onKey?: boolean
  active?: string | null
  onActiveChange?: (id: string | null) => void
}) {
  const [ownActive, setOwnActive] = useState<string | null>(null)
  const fill = widthProp === 'fill'
  const box = useRef<HTMLDivElement>(null)
  // Server render (and the first client paint) use the compact width until measured.
  const measured = useWidth(box)
  const width = fill ? (measured ?? 216) : widthProp
  const current = active === undefined ? ownActive : active
  const setActive = onActiveChange ?? setOwnActive
  // No reports means no time window to draw (Math.max() of nothing is -Infinity).
  if (sources.length === 0) return null
  const latest = Math.max(...sources.map((s) => Date.parse(s.at)))
  const nowMs = Date.parse(now)
  const end = latest < nowMs - CELLS * HOUR ? latest : nowMs
  const stale = end !== nowMs
  const cw = width / CELLS
  const r = Math.min(R, cw / 2 - 1.3)
  const columns = Array.from({ length: CELLS }, () => [] as TraceSource[])
  for (const s of sources) {
    const hoursAgo = (end - Date.parse(s.at)) / HOUR
    const cell = Math.min(CELLS - 1, Math.max(0, Math.floor(CELLS - hoursAgo)))
    columns[cell]?.push(s)
  }
  // Cited first (drawn at the bottom), so "+" hides uncited marks where possible.
  for (const col of columns)
    col.sort((a, b) => Number(b.citation !== null) - Number(a.citation !== null))
  const rows = fixedRows ?? Math.max(variant === 'full' ? 2 : 3, ...columns.map((c) => c.length))
  const h = rows * RH + 4
  const H = h + (variant === 'full' ? 18 : 0)
  const cited = sources.filter((s) => s.citation !== null).length
  const label = (hoursAgo: number) => {
    const at = new Date(end - hoursAgo * HOUR).toISOString()
    if (hoursAgo === 0) return stale ? formatDate(at) : 'now'
    return stale ? `${formatDate(at)} ${clockTime(at)}` : clockTime(at)
  }

  const svg = (
    <svg
      viewBox={`0 0 ${width} ${H}`}
      width={width}
      height={H}
      role="img"
      aria-label={`${plural(sources.length, 'publisher')} by hour, ${cited} cited`}
      className="block h-auto max-w-full overflow-visible"
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
      {columns.flatMap((col, i) => {
        const overflow = col.length > rows
        const shown = overflow ? col.slice(0, rows - 1) : col
        const hidden = overflow ? col.slice(rows - 1) : []
        const x = i * cw + cw / 2
        const yAt = (j: number) => h - 2 - RH / 2 - j * RH
        const more = overflow ? (
          <Tooltip
            key={`more-${hidden[0]?.id}`}
            delay={60}
            content={`${hidden.length} more: ${hidden.map((s) => s.outlet).join(', ')}`}
          >
            <g className="cursor-default">
              <rect
                x={i * cw}
                y={yAt(rows - 1) - RH / 2}
                width={cw}
                height={RH}
                fill="transparent"
              />
              <text
                x={x}
                y={yAt(rows - 1)}
                textAnchor="middle"
                dominantBaseline="central"
                className={cx('text-xs font-bold', onKey ? 'fill-key-text' : 'fill-trace-cited')}
              >
                +
              </text>
            </g>
          </Tooltip>
        ) : null
        return [
          ...shown.map((s, j) => {
            const y = yAt(j)
            return (
              <Tooltip
                key={s.id}
                delay={60}
                content={`${s.outlet} · ${citationLabel(s.citation)} · ${formatDateTime(s.at)}`}
              >
                <g
                  onPointerEnter={() => setActive(s.id)}
                  onPointerLeave={() => setActive(null)}
                  className="cursor-default"
                >
                  {/* Cell-sized hit area: the mark is only ~7px across. */}
                  <rect x={i * cw} y={y - RH / 2} width={cw} height={RH} fill="transparent" />
                  <circle
                    cx={x}
                    cy={y}
                    r={r}
                    strokeWidth={s.citation === null ? 1.5 : 0}
                    className={cx(
                      'origin-center transition-[scale,opacity] [transform-box:fill-box]',
                      current === s.id && 'scale-150',
                      current && current !== s.id && 'opacity-35',
                      s.citation === null
                        ? onKey
                          ? 'fill-key stroke-key-text'
                          : 'fill-canvas stroke-trace-observed'
                        : onKey
                          ? 'fill-key-text'
                          : 'fill-trace-cited',
                    )}
                  />
                </g>
              </Tooltip>
            )
          }),
          more,
        ]
      })}
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
  return fill ? (
    <div ref={box} className="w-full">
      {svg}
    </div>
  ) : (
    svg
  )
}
