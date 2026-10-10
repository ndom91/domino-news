import type { StorySource } from '@dn/schemas'
import { cx } from '../cx.ts'
import { Timestamp } from './time.tsx'

/** Original reporting for a Story. Links open the publisher's article; no text is reproduced beyond the feed description. */
export function SourceList({ sources }: { sources: StorySource[] }) {
  return (
    <ol className="flex flex-col divide-y divide-border border-y border-border">
      {sources.map((s) => (
        <li
          key={s.articleId}
          id={`source-${s.articleId}`}
          className="scroll-mt-24 py-4 target:bg-accent-subtle"
        >
          <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-sm font-semibold text-text">{s.publisher.name}</span>
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
