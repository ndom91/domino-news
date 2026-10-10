import type { CoverageMatrix as CoverageMatrixData } from '@dn/schemas'
import { cx } from '../cx.ts'
import type { LinkLike } from './story-row.tsx'

const DefaultLink: LinkLike = ({ to, className, children }) => (
  <a href={to} className={className}>
    {children}
  </a>
)

/**
 * Who covered what: Stories (rows) × outlets (columns). A dot means the outlet reported
 * the Story; a ringed dot means it reported first. Coverage only, never credibility.
 * Scrolls inside its own container on narrow screens.
 */
export function CoverageMatrix({
  matrix,
  Link = DefaultLink,
  className,
}: {
  matrix: CoverageMatrixData
  Link?: LinkLike
  className?: string
}) {
  if (matrix.stories.length === 0) return null
  return (
    <div className={cx('relative overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">
        <caption className="mb-3 text-left text-xs text-text-muted">
          Each row is a Story covered by more than one outlet. A dot means the outlet reported it; a
          ringed dot means it reported first.
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 bg-canvas pr-4 text-left align-bottom font-normal"
            >
              <span className="sr-only">Story</span>
            </th>
            {matrix.publishers.map((p) => (
              <th key={p.id} scope="col" className="h-44 w-9 min-w-9 px-0 align-bottom font-normal">
                <Link
                  to={`/publishers/${p.slug}`}
                  className="inline-block max-h-42 rotate-180 truncate whitespace-nowrap text-xs text-text-secondary [writing-mode:vertical-rl] hover:text-text"
                >
                  {p.name}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.stories.map((story) => {
            const cells = new Map(story.coverage.map((c) => [c.publisherId, c.first]))
            return (
              <tr key={story.id} className="border-t border-border">
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-48 max-w-80 bg-canvas py-2 pr-4 text-left font-normal"
                >
                  <Link
                    to={`/stories/${story.slug}`}
                    className="line-clamp-2 font-serif leading-snug text-text hover:underline underline-offset-4"
                  >
                    {story.title}
                  </Link>
                </th>
                {matrix.publishers.map((p) => {
                  const first = cells.get(p.id)
                  return (
                    <td key={p.id} className="text-center">
                      {first === undefined ? (
                        <span
                          aria-hidden
                          className="inline-block size-1 rounded-full bg-border-strong"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className={cx(
                            'inline-block size-2.5 rounded-full bg-text',
                            first && 'ring-2 ring-accent ring-offset-2 ring-offset-canvas',
                          )}
                        />
                      )}
                      <span className="sr-only">
                        {first === undefined
                          ? 'not covered'
                          : first
                            ? 'covered, reported first'
                            : 'covered'}
                      </span>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
