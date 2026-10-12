import { plural, stripCitations } from '@dn/domain'
import type { NarrativeDetail } from '@dn/schemas'
import type { CSSProperties } from 'react'
import { cx } from '../cx.ts'
import { deskKey } from './desk-key.ts'
import { DefaultLink, type LinkLike } from './link.tsx'
import { layoutNarrative } from './narrative-layout.ts'
import { relationLabel } from './relations.ts'
import { Timestamp } from './time.tsx'

// Marker centre from the row top, level with the date line. The line and marker share the
// gutter's centre (12px), so markers always sit on the line.
const MARK_Y = 19

/**
 * A Narrative as one timeline, oldest first: one marker per Story on a single line in the
 * Narrative's colour. How Stories connect is written out (Responds to, Follows…), not drawn.
 * The current Story (on a Story page), or else the latest, gets a filled marker.
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
  const { rows } = layoutNarrative(narrative.stories, narrative.edges)
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
      {rows.map(({ node, primary, secondary }, i) => {
        const isCurrent = node.id === currentStoryId
        const filled = node.id === highlightId
        return (
          <li key={node.id} className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-2">
            <span aria-hidden className="relative">
              {i > 0 ? (
                <span
                  className="absolute top-0 left-[11px] w-0.5 bg-(--line)"
                  style={{ height: MARK_Y }}
                />
              ) : null}
              {i < rows.length - 1 ? (
                <span
                  className="absolute bottom-0 left-[11px] w-0.5 bg-(--line)"
                  style={{ top: MARK_Y }}
                />
              ) : null}
              <span
                className={cx(
                  'absolute left-1.5 size-3',
                  filled ? 'bg-(--line)' : 'bg-canvas shadow-[inset_0_0_0_2px_var(--line)]',
                )}
                style={{ top: MARK_Y - 6 }}
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
