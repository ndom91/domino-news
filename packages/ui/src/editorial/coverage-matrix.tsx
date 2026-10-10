import type { CoverageMatrix as CoverageMatrixData } from '@dn/schemas'
import { cx } from '../cx.ts'
import { DefaultLink, type LinkLike } from './link.tsx'

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
        <caption className="mb-3 text-left type-meta">
          Each row is a Story covered by more than one outlet. A square means the outlet reported
          it; ann outlined square means it reported first.
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
                  className="inline-block max-h-42 rotate-180 truncate whitespace-nowrap text-sm font-semibold text-text [writing-mode:vertical-rl] hover:underline"
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
              <tr
                key={story.id}
                className="border-t border-border first:border-t-2 first:border-rule"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-48 max-w-80 bg-canvas py-2 pr-4 text-left font-normal"
                >
                  <Link
                    to={`/stories/${story.slug}`}
                    className="line-clamp-2 font-bold leading-snug text-text [font-stretch:72%] text-md link-headline"
                  >
                    {story.title}
                  </Link>
                </th>
                {matrix.publishers.map((p) => {
                  const first = cells.get(p.id)
                  return (
                    <td key={p.id} className="text-center">
                      {first === undefined ? (
                        <span aria-hidden className="inline-block h-px w-2 bg-border-strong" />
                      ) : (
                        <span
                          aria-hidden
                          className={cx(
                            'inline-block size-3 bg-text',
                            first && 'outline-2 outline-offset-2 outline-text',
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
