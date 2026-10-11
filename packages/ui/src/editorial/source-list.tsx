import { plural } from '@dn/domain'
import type { StorySource } from '@dn/schemas'
import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { Button } from '../primitives/button.tsx'
import { Badge } from '../primitives/surface.tsx'
import { DefaultLink, type LinkLike } from './link.tsx'
import { Timestamp } from './time.tsx'

const COLLAPSED_COUNT = 5

const byPublished = (a: StorySource, b: StorySource) =>
  (a.publishedAt ?? a.observedAt).localeCompare(b.publishedAt ?? b.observedAt)

/**
 * Original reporting for a Story, in publishing order. Links open the publisher's article;
 * no text is reproduced beyond the feed's own headline and description.
 * Shows the first few until the reader asks for all, or a citation links to a hidden one.
 */
export function SourceList({
  sources,
  Link = DefaultLink,
}: {
  sources: StorySource[]
  Link?: LinkLike
}) {
  const ordered = sources.toSorted(byPublished)
  const [expanded, setExpanded] = useState(false)

  // Citations link to #report-<id>. If that row is hidden, expand and scroll to it.
  useEffect(() => {
    function reveal() {
      const id = decodeURIComponent(window.location.hash.slice(1))
      const index = sources.toSorted(byPublished).findIndex((s) => `report-${s.articleId}` === id)
      if (index < COLLAPSED_COUNT) return
      flushSync(() => setExpanded(true))
      document.getElementById(id)?.scrollIntoView()
    }
    reveal()
    window.addEventListener('hashchange', reveal)
    return () => window.removeEventListener('hashchange', reveal)
  }, [sources])

  const shown = expanded ? ordered : ordered.slice(0, COLLAPSED_COUNT)
  return (
    <>
      <ol className="flex flex-col">
        {shown.map((s) => (
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
                <Timestamp at={s.publishedAt ?? s.observedAt} format="clock" /> ·{' '}
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
      {shown.length < ordered.length ? (
        <Button className="mt-4" onClick={() => setExpanded(true)}>
          View all {plural(ordered.length, 'report')}
        </Button>
      ) : null}
    </>
  )
}
