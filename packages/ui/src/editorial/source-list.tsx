import type { StorySource } from '@dn/schemas'
import { cx } from '../cx.ts'
import type { LinkLike } from './story-row.tsx'
import { Timestamp } from './time.tsx'

/** Original reporting for a Story. Links open the publisher's article; no text is reproduced beyond the feed description. */
const DefaultLink: LinkLike = ({ to, className, children }) => (
  <a href={to} className={className}>
    {children}
  </a>
)

export function SourceList({
  sources,
  Link = DefaultLink,
}: {
  sources: StorySource[]
  Link?: LinkLike
}) {
  return (
    <ol className="flex flex-col divide-y divide-border border-y border-border">
      {sources.map((s) => (
        <li
          key={s.articleId}
          id={`source-${s.articleId}`}
          className="scroll-mt-24 py-4 target:bg-accent-subtle"
        >
          <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Link
              to={`/publishers/${s.publisher.slug}`}
              className="text-sm font-semibold text-text hover:underline underline-offset-4"
            >
              {s.publisher.name}
            </Link>
            <Timestamp iso={s.publishedAt ?? s.observedAt} />
            <span
              className={cx(
                'font-mono text-2xs uppercase tracking-label',
                s.citedInSummary ? 'text-text-secondary' : 'text-text-muted',
              )}
            >
              {s.citedInSummary ? 'Cited' : 'Not cited'}
            </span>
          </div>
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline font-serif text-md leading-snug text-text hover:text-accent"
          >
            {s.title}
            <span aria-hidden className="ml-1 inline-block text-text-muted group-hover:text-accent">
              ↗
            </span>
            <span className="sr-only"> (opens {s.publisher.domain})</span>
          </a>
          {s.description && s.description !== s.title ? (
            <p className="mt-1 max-w-reading text-sm leading-normal text-text-secondary line-clamp-3">
              {s.description}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
