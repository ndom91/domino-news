import { formatDate, plural, storiesPerDay } from '@dn/domain'
import { scaleLinear } from 'd3-scale'
import { area, line } from 'd3-shape'
import { Tooltip } from '../primitives/overlay.tsx'

const W = 420
const H = 300
const M = { top: 12, right: 10, bottom: 26, left: 26 }

/**
 * Line chart of a Narrative's Stories per day, in the surrounding key colour (set `deskKey`
 * on a parent). Fixed viewBox scaled to the column width, so it renders the same on the server.
 */
export function NarrativeActivity({ times }: { times: string[] }) {
  const data = storiesPerDay(times)
  if (data.length === 0) return null
  const max = Math.max(...data.map((d) => d.count))
  const x = scaleLinear()
    .domain([0, data.length - 1])
    .range([M.left, W - M.right])
  const y = scaleLinear()
    .domain([0, Math.max(2, max)])
    .nice()
    .range([H - M.bottom, M.top])
  const pts = data.map((d, i) => [x(i), y(d.count)] as [number, number])
  const base = y(0)
  const yTicks = y.ticks(3).filter(Number.isInteger)
  // Every day when there are few, else about four evenly spaced dates (always the last).
  const step = Math.max(1, Math.ceil((data.length - 1) / 3))
  const xTicks = data.map((_, i) => i).filter((i) => (data.length - 1 - i) % step === 0)
  const peak = data.reduce((a, b) => (b.count > a.count ? b : a))
  // Skip the empty lead-in days.
  const firstDay = data.find((d) => d.count > 0)?.day ?? ''

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Stories per day, ${formatDate(firstDay)} to ${formatDate(data.at(-1)?.day ?? '')}: ${plural(times.length, 'story', 'stories')}, most on ${formatDate(peak.day)} (${peak.count})`}
      className="block h-auto w-full overflow-visible"
    >
      {yTicks.map((t) => (
        <g key={t}>
          <line
            x1={M.left}
            x2={W - M.right}
            y1={y(t)}
            y2={y(t)}
            className={t === 0 ? 'stroke-rule' : 'stroke-border'}
            strokeWidth={t === 0 ? 2 : 1}
          />
          <text
            x={M.left - 8}
            y={y(t)}
            dy="0.35em"
            textAnchor="end"
            className="fill-text-muted text-2xs"
          >
            {t}
          </text>
        </g>
      ))}
      <path d={area().y0(base)(pts) ?? ''} className="fill-key/20" />
      <path d={line()(pts) ?? ''} className="fill-none stroke-key" strokeWidth={3} />
      {data.map((d, i) =>
        d.count > 0 ? (
          <Tooltip
            key={d.day}
            delay={60}
            content={`${plural(d.count, 'story', 'stories')} published on ${formatDate(d.day)}`}
          >
            <g className="group cursor-default">
              {/* 28px hit area around the 10px marker; the tooltip anchors to it, so keep it tight. */}
              <rect x={x(i) - 14} y={y(d.count) - 14} width={28} height={28} fill="transparent" />
              <rect
                x={x(i) - 5}
                y={y(d.count) - 5}
                width={10}
                height={10}
                strokeWidth={2}
                className="origin-center fill-key stroke-canvas transition-[scale] [transform-box:fill-box] group-hover:scale-150"
              />
            </g>
          </Tooltip>
        ) : null,
      )}
      {xTicks.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 4}
          textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
          className="fill-text-muted text-2xs"
        >
          {formatDate(data[i]?.day ?? '')}
        </text>
      ))}
    </svg>
  )
}
