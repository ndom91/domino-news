import { plural, stripCitations } from '@dn/domain'
import type { NarrativeDetail } from '@dn/schemas'
import type { CSSProperties } from 'react'
import { cx } from '../cx.ts'
import { deskKey } from './desk-key.ts'
import { DefaultLink, type LinkLike } from './link.tsx'
import { layoutNarrative, type Segment } from './narrative-layout.ts'
import { relationLabel } from './relations.ts'
import { Timestamp } from './time.tsx'

// Marker centre from the row top, level with the date line.
const MARK_Y = 19
const LANE = 16 // px between lane centres
const laneX = (lane: number) => 12 + lane * LANE

const SOLID = 'bg-(--line)'
const DASHED = {
  y: 'bg-[repeating-linear-gradient(to_bottom,var(--line)_0_5px,transparent_5px_9px)]',
  x: 'bg-[repeating-linear-gradient(to_right,var(--line)_0_5px,transparent_5px_9px)]',
}
const lineClass = (segment: Exclude<Segment, null>, axis: 'x' | 'y') =>
  segment === 'solid' ? SOLID : DASHED[axis]

/**
 * A Narrative as a git-style tree, oldest first: one marker per Story, a lane per thread, in
 * the Narrative's colour. A branch leaves its parent's marker with a square elbow; dashed lines
 * are loose links (related, background). How Stories connect is also written out, since lines
 * don't say how. The current Story (on a Story page), or else the latest, gets a filled marker.
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
  const { rows, laneCount } = layoutNarrative(narrative.stories, narrative.edges)
  const byId = new Map(narrative.stories.map((s) => [s.id, s]))
  const highlightId = currentStoryId ?? rows.at(-1)?.node.id
  const storyLink = (id: string) => {
    const story = byId.get(id)
    return story ? (
      <Link to={`/stories/${story.slug}`} className="hover:underline">
        {story.title}
      </Link>
    ) : null
  }

  return (
    <ol
      aria-label={`${plural(narrative.stories.length, 'story', 'stories')}, oldest first`}
      className={cx(deskKey(narrative.desk), 'flex flex-col')}
      // Desk colour for the line and markers; without a desk the neutral key nearly vanishes
      // on the dark canvas, so use the strong border colour instead.
      style={
        { '--line': narrative.desk ? 'var(--dn-key)' : 'var(--dn-border-strong)' } as CSSProperties
      }
    >
      {rows.map(({ node, lane, primary, secondary, top, bottom, elbows }) => {
        const isCurrent = node.id === currentStoryId
        const filled = node.id === highlightId
        return (
          <li
            key={node.id}
            className="relative grid gap-x-2"
            style={{ gridTemplateColumns: `${laneX(laneCount - 1) + 12}px minmax(0,1fr)` }}
          >
            <span aria-hidden className="relative">
              {top.map((segment, l) =>
                segment ? (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: one slot per lane
                    key={`t${l}`}
                    className={cx('absolute top-0 w-0.5', lineClass(segment, 'y'))}
                    style={{ left: laneX(l) - 1, height: MARK_Y }}
                  />
                ) : null,
              )}
              {bottom.map((segment, l) =>
                segment ? (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: one slot per lane
                    key={`b${l}`}
                    className={cx('absolute bottom-0 w-0.5', lineClass(segment, 'y'))}
                    style={{ left: laneX(l) - 1, top: MARK_Y }}
                  />
                ) : null,
              )}
              {elbows.map((elbow) => (
                <span
                  key={`e${elbow.lane}`}
                  className={cx('absolute h-0.5', lineClass(elbow.segment, 'x'))}
                  style={{
                    left: Math.min(laneX(lane), laneX(elbow.lane)) - 1,
                    width: Math.abs(laneX(elbow.lane) - laneX(lane)) + 2,
                    top: MARK_Y - 1,
                  }}
                />
              ))}
              <span
                className={cx(
                  'absolute size-3',
                  filled ? 'bg-(--line)' : 'bg-canvas shadow-[inset_0_0_0_2px_var(--line)]',
                )}
                style={{ left: laneX(lane) - 6, top: MARK_Y - 6 }}
              />
            </span>
            <div
              className={cx(
                'flex min-w-0 flex-col gap-1 border-b border-border px-3 pt-2.5 pb-5',
                isCurrent && 'bg-sunken',
              )}
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <Timestamp
                  at={node.firstObservedAt}
                  format="datetime"
                  className="type-meta font-semibold whitespace-nowrap"
                />
                {primary ? (
                  <span className="text-xs font-semibold tracking-label text-text-muted uppercase">
                    {relationLabel(primary.relation, 'outgoing')}{' '}
                    <span className="normal-case tracking-normal">
                      {storyLink(primary.parentId)}
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
                  {stripCitations(node.summary)}
                </p>
              ) : null}
              {secondary.length > 0 ? (
                <ul className="mt-1 flex flex-col gap-0.5 text-label text-text-muted">
                  {secondary.map((s) => (
                    <li key={`${s.otherId}-${s.relation}`}>
                      {relationLabel(s.relation, s.direction)}: {storyLink(s.otherId)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <span className="type-meta">{plural(node.sourceCount, 'publisher')}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
