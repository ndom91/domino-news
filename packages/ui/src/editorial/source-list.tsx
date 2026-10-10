import type { StorySource } from '@dn/schemas'
import { Badge } from '../primitives/surface.tsx'
import { DefaultLink, type LinkLike } from './link.tsx'
import { Timestamp } from './time.tsx'

/**
 * Original reporting for a Story, in publishing order. Links open the publisher's article;
 * no text is reproduced beyond the feed's own headline and description.
 */
export function SourceList({
  sources,
  Link = DefaultLink,
}: {
  sources: StorySource[]
  Link?: LinkLike
}) {
  const ordered = [...sources].sort((a, b) =>
    (a.publishedAt ?? a.observedAt).localeCompare(b.publishedAt ?? b.observedAt),
  )
  return (
    <ol className="flex flex-col border-t-2 border-rule">
      {ordered.map((s) => (
        <li
          key={s.articleId}
          id={`report-${s.articleId}`}
          className="scroll-mt-24 border-b border-border py-4"
        >
          <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <Link
              to={`/publishers/${s.publisher.slug}`}
              className="text-base font-bold hover:underline"
            >
              {s.publisher.name}
            </Link>
            {s.official ? <Badge>Official source</Badge> : null}
            <span className="type-meta">
              <Timestamp at={s.publishedAt ?? s.observedAt} format="clock" /> UTC ·{' '}
              {s.citation ? `cited [${s.citation}]` : s.citedInSummary ? 'cited' : 'not cited'}
            </span>
          </div>
          <a
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="type-headline text-[1.375rem] link-headline"
          >
            {s.title}
            <span className="sr-only"> (opens {s.publisher.domain})</span>
          </a>
          {s.description && s.description !== s.title ? (
            <p className="mt-1.5 line-clamp-3 max-w-reading text-base leading-normal text-text-secondary">
              {s.description}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
