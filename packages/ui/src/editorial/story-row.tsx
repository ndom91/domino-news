import { REGION_LABELS, type StoryListItem } from '@dn/schemas'
import type { ComponentType, ReactNode } from 'react'
import { cx } from '../cx.ts'
import { SourceTrace } from './source-trace.tsx'
import { Timestamp } from './time.tsx'

/** Router-agnostic link component (TanStack Link on web, plain <a> in Playroom). */
export type LinkLike = ComponentType<{ to: string; className?: string; children: ReactNode }>

const DefaultLink: LinkLike = ({ to, className, children }) => (
  <a href={to} className={className}>
    {children}
  </a>
)

export interface StoryRowProps {
  story: StoryListItem
  Link?: LinkLike
  lead?: boolean
  className?: string
}

/** A feed entry. The headline is the link; publishers and narrative are secondary routes. */
export function StoryRow({ story, Link = DefaultLink, lead = false, className }: StoryRowProps) {
  const narrative = story.narratives[0]
  return (
    <article className={cx('group relative flex flex-col gap-2.5', className)}>
      {narrative ? (
        <Link
          to={`/narratives/${narrative.slug}`}
          className="relative z-10 w-fit text-xs font-medium uppercase tracking-label text-accent hover:underline"
        >
          {narrative.title}
        </Link>
      ) : null}
      <h2
        className={cx(
          'font-serif font-medium tracking-tight text-text text-balance',
          lead ? 'text-2xl leading-tight md:text-3xl' : 'text-xl leading-snug',
        )}
      >
        <Link
          to={`/stories/${story.slug}`}
          className="decoration-1 underline-offset-4 hover:underline focus-visible:underline"
        >
          {story.title}
        </Link>
      </h2>
      {story.summary ? (
        <p
          className={cx(
            'max-w-reading text-text-secondary text-pretty',
            lead ? 'text-md leading-reading' : 'line-clamp-3 text-base leading-normal',
          )}
        >
          {story.summary}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SourceTrace sources={story.trace} />
        <span className="text-xs text-text-muted">
          {story.publishers
            .slice(0, 4)
            .map((p) => p.name)
            .join(', ')}
          {story.publishers.length > 4 ? ` +${story.publishers.length - 4}` : ''}
        </span>
        {story.regions.length > 0 ? (
          <span className="text-xs text-text-muted">
            {story.regions.map((r) => REGION_LABELS[r]).join(' · ')}
          </span>
        ) : null}
        <Timestamp iso={story.lastUpdatedAt} prefix="Updated" />
      </div>
    </article>
  )
}
