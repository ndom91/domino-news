import { formatDate } from '@dn/domain'
import type { NarrativeDetail } from '@dn/schemas'
import { cx } from '../cx.ts'
import { layoutNarrative } from './narrative-layout.ts'
import { relationLabel } from './relations.ts'
import type { LinkLike } from './story-row.tsx'

const LANE = 22 // px between lane centres
const DOT_Y = 26 // px from row top to node centre (aligned with the title's first line)
const LANE_COLORS = ['bg-viz-1', 'bg-viz-2', 'bg-viz-3', 'bg-viz-4', 'bg-viz-5', 'bg-viz-6']
const laneColor = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length]

const DefaultLink: LinkLike = ({ to, className, children }) => (
  <a href={to} className={className}>
    {children}
  </a>
)

/**
 * Branching history of a Narrative. Each row is one Story; coloured lanes show how
 * developments continue (same lane) or branch (new lane). Colours only separate lanes.
 */
export function NarrativeGraph({
  narrative,
  currentStoryId,
  Link = DefaultLink,
}: {
  narrative: NarrativeDetail
  currentStoryId?: string
  Link?: LinkLike
}) {
  const layout = layoutNarrative(narrative.stories, narrative.edges)
  const titleById = new Map(narrative.stories.map((s) => [s.id, s.title]))
  const gutter = layout.laneCount * LANE + 8

  return (
    <ol
      aria-label={`${narrative.stories.length} developments, oldest first`}
      className="flex flex-col"
    >
      {layout.rows.map(({ node, row, lane, primary, secondary }) => {
        const isCurrent = node.id === currentStoryId
        return (
          <li key={node.id} className="relative flex min-h-24" style={{ paddingLeft: gutter }}>
            <div aria-hidden className="absolute inset-y-0 left-0" style={{ width: gutter }}>
              {layout.laneSpans.map((span) => {
                if (row < span.start || row > span.end || span.start === span.end) return null
                const top = row === span.start ? DOT_Y : 0
                const bottom = row === span.end ? `calc(100% - ${DOT_Y}px)` : 0
                return (
                  <span
                    key={span.lane}
                    className={cx('absolute w-0.5', laneColor(span.lane))}
                    style={{ left: span.lane * LANE + 10, top, bottom }}
                  />
                )
              })}
              {layout.laneSpans
                .filter((s) => s.branchFromLane !== null && s.start === row)
                .map((span) => {
                  const from = (span.branchFromLane ?? 0) * LANE + 11
                  const to = span.lane * LANE + 11
                  return (
                    <span
                      key={`elbow-${span.lane}`}
                      className={cx('absolute h-0.5', laneColor(span.lane))}
                      style={{
                        left: Math.min(from, to),
                        width: Math.abs(to - from),
                        top: DOT_Y - 1,
                      }}
                    />
                  )
                })}
              <span
                className={cx(
                  'absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-canvas',
                  isCurrent ? 'bg-text' : laneColor(lane),
                )}
                style={{ left: lane * LANE + 11, top: DOT_Y }}
              />
            </div>
            <div
              className={cx(
                'flex w-full flex-col gap-1 rounded-md px-3 pt-2.5 pb-5',
                isCurrent && 'bg-sunken',
              )}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <time dateTime={node.firstObservedAt} className="font-mono text-xs text-text-muted">
                  {formatDate(node.firstObservedAt)}
                </time>
                {primary ? (
                  <span className="text-xs text-text-muted">
                    {relationLabel(primary.relation, 'outgoing')}:{' '}
                    <span className="text-text-secondary">{titleById.get(primary.parentId)}</span>
                  </span>
                ) : null}
              </div>
              <h3 className="font-serif text-lg leading-snug text-text text-balance">
                {isCurrent ? (
                  <span>
                    {node.title} <span className="sr-only">(current story)</span>
                  </span>
                ) : (
                  <Link to={`/stories/${node.slug}`} className="underline-offset-4 hover:underline">
                    {node.title}
                  </Link>
                )}
              </h3>
              {node.summary ? (
                <p className="line-clamp-2 max-w-reading text-sm leading-normal text-text-secondary">
                  {node.summary}
                </p>
              ) : null}
              {secondary.length > 0 ? (
                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-text-muted">
                  {secondary.map((s) => (
                    <li key={`${s.otherId}-${s.relation}`}>
                      {relationLabel(s.relation, s.direction)}: {titleById.get(s.otherId)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <span className="font-mono text-2xs text-text-muted">
                {node.sourceCount} {node.sourceCount === 1 ? 'source' : 'sources'}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
