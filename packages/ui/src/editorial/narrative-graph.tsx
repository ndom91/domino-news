import { formatDate } from '@dn/domain'
import type { NarrativeDetail } from '@dn/schemas'
import { cx } from '../cx.ts'
import { DefaultLink, type LinkLike } from './link.tsx'
import { narrativeKey } from './narrative-key.ts'
import { layoutNarrative } from './narrative-layout.ts'
import { relationLabel } from './relations.ts'

const LANE = 22 // px between lane centres
const DOT_Y = 26 // px from row top to node centre (aligned with the title's first line)
// Every lane is the Narrative's key colour: colour means "this Narrative", position shows branches.
const laneColor = (_lane: number) => 'bg-key'

/**
 * Branching history of a Narrative. Each row is one Story; lanes show how developments
 * continue (same lane) or branch (new lane). Lines use the Narrative's key colour.
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
      className={cx(narrativeKey(narrative.colorSlot), 'flex flex-col border-t-2 border-rule')}
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
                  'absolute -translate-x-1/2 -translate-y-1/2 ring-4 ring-canvas',
                  isCurrent ? 'size-3.5 bg-text' : cx('size-3', laneColor(lane)),
                )}
                style={{ left: lane * LANE + 11, top: DOT_Y }}
              />
            </div>
            <div
              className={cx(
                'flex w-full flex-col gap-1 border-b border-border px-3 pt-2.5 pb-5',
                isCurrent && 'bg-sunken',
              )}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <time dateTime={node.firstObservedAt} className="type-meta font-semibold">
                  {formatDate(node.firstObservedAt)}
                </time>
                {primary ? (
                  <span className="text-xs font-semibold tracking-label text-text-muted uppercase">
                    {relationLabel(primary.relation, 'outgoing')}{' '}
                    <span className="normal-case tracking-normal">
                      {titleById.get(primary.parentId)}
                    </span>
                  </span>
                ) : null}
              </div>
              <h3 className="type-headline text-[1.5rem]">
                {isCurrent ? (
                  <span>
                    {node.title} <span className="sr-only">(current story)</span>
                  </span>
                ) : (
                  <Link to={`/stories/${node.slug}`} className="link-headline">
                    {node.title}
                  </Link>
                )}
              </h3>
              {node.summary ? (
                <p className="line-clamp-2 max-w-reading text-base leading-normal text-text-secondary">
                  {node.summary.replace(/\[\d+\]/g, '')}
                </p>
              ) : null}
              {secondary.length > 0 ? (
                <ul className="mt-1 flex flex-col gap-0.5 text-label text-text-muted">
                  {secondary.map((s) => (
                    <li key={`${s.otherId}-${s.relation}`}>
                      {relationLabel(s.relation, s.direction)}: {titleById.get(s.otherId)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <span className="type-meta">
                {node.sourceCount} {node.sourceCount === 1 ? 'source' : 'sources'}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
