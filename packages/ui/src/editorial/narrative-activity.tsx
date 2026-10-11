import { formatDate, plural } from '@dn/domain'
import { scaleLinear } from 'd3-scale'
import { area, line } from 'd3-shape'

const DAY = 86_400_000
const W = 320
const H = 168
const M = { top: 10, right: 8, bottom: 22, left: 24 }

/**
 * Stories per UTC day, from `leadIn` empty days before the first Story through the last one.
 * The lead-in gives the line a baseline to rise from.
 */
export function storiesPerDay(times: string[], leadIn = 3) {
  const days = times.map((t) => Math.floor(Date.parse(t) / DAY))
  if (days.length === 0) return []
  const first = Math.min(...days) - leadIn
  const counts = Array.from({ length: Math.max(...days) - first + 1 }, () => 0)
  for (const d of days) counts[d - first] = (counts[d - first] ?? 0) + 1
  return counts.map((count, i) => ({ day: new Date((first + i) * DAY).toISOString(), count }))
}

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

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Stories per day, ${formatDate(data[0]?.day ?? '')} to ${formatDate(data.at(-1)?.day ?? '')}: ${plural(times.length, 'story', 'stories')}, most on ${formatDate(peak.day)} (${peak.count})`}
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
      <path d={line()(pts) ?? ''} className="fill-none stroke-key" strokeWidth={2.5} />
      {data.map((d, i) =>
        d.count > 0 ? (
          <rect
            key={d.day}
            x={x(i) - 4}
            y={y(d.count) - 4}
            width={8}
            height={8}
            className="fill-key stroke-canvas"
            strokeWidth={1.5}
          />
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
