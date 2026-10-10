import { clockTime, hostnameOf } from '@dn/domain'
import type { StoryListItem } from '@dn/schemas'
import { cx } from '../cx.ts'
import { Skeleton } from '../primitives/surface.tsx'
import type { CitedSource } from './citation.tsx'
import { SummaryText } from './citation.tsx'
import { DefaultLink, type LinkLike } from './link.tsx'
import { relationLabel } from './relations.ts'
import { SourceTrace } from './source-trace.tsx'
import { StoryBar } from './story-bar.tsx'

/** Black uppercase flag before a correcting Story's headline. */
export function CorrectionFlag() {
  return (
    <span className="mr-2 inline-block bg-text px-1.5 py-[3px] align-[5px] text-2xs font-extrabold tracking-[0.05em] text-canvas uppercase [font-stretch:100%]">
      Correction
    </span>
  )
}

export function citedSourcesOf(story: Pick<StoryListItem, 'slug' | 'trace'>) {
  const map = new Map<number, CitedSource>()
  for (const t of story.trace) {
    if (t.citation)
      map.set(t.citation, {
        outlet: t.publisherName,
        href: `/stories/${story.slug}#source-${t.id}`,
      })
  }
  return map
}

/** Feed entry: desk bar, headline, cited summary, relation, primary source and Source Trace. No card. */
export function StoryItem({
  story,
  size = 'standard',
  now,
  Link = DefaultLink,
  className,
}: {
  story: StoryListItem
  size?: 'standard' | 'wide'
  now: string
  Link?: LinkLike
  className?: string
}) {
  const wide = size === 'wide'
  const narrative = story.narratives[0]
  const latest = story.trace.reduce((max, t) => (t.at > max ? t.at : max), story.lastUpdatedAt)
  const first = story.trace.reduce((min, t) => (t.at < min ? t.at : min), story.firstObservedAt)
  const cited = story.trace.filter((t) => t.citation !== null).length
  return (
    <article
      className={cx('flex min-w-0 flex-col', wide && 'lg:col-span-2 md:col-span-2', className)}
    >
      <StoryBar
        desk={story.desk}
        narrative={
          narrative ? { title: narrative.title, href: `/narratives/${narrative.slug}` } : undefined
        }
        timestamp={latest}
        Link={Link}
      />
      <h3
        className={cx(
          'mt-3.5 mb-3',
          wide ? 'type-headline-lg' : 'type-headline max-md:text-[1.75rem]',
        )}
      >
        <Link to={`/stories/${story.slug}`} className="link-headline">
          {story.correction ? <CorrectionFlag /> : null}
          {story.title}
        </Link>
      </h3>
      {story.summary ? (
        <p className={cx('leading-normal', wide ? 'max-w-[36rem] text-md' : 'text-base')}>
          <SummaryText text={story.summary} sources={citedSourcesOf(story)} />
        </p>
      ) : null}
      {story.relation ? (
        <p className="mt-2.5 text-label text-text-muted">
          <b className="font-bold text-text">{relationLabel(story.relation.type)}</b>{' '}
          <Link to={`/stories/${story.relation.slug}`} className="hover:underline">
            {story.relation.title}
          </Link>
        </p>
      ) : null}
      {story.primarySource ? (
        <p className="mt-2.5 text-label">
          Primary source:{' '}
          <a
            href={story.primarySource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline decoration-accent decoration-2 underline-offset-3"
          >
            {story.primarySource.title ??
              hostnameOf(story.primarySource.url) ??
              story.primarySource.url}
          </a>
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-1.5 type-meta">
        <SourceTrace
          sources={story.trace.map((t) => ({
            id: t.id,
            outlet: t.publisherName,
            at: t.at,
            citation: t.citation,
          }))}
          now={now}
          width={wide ? 336 : 216}
        />
        <span>
          {story.sourceCount} {story.sourceCount === 1 ? 'publisher' : 'publishers'} · {cited} cited
          · first {clockTime(first)} UTC
        </span>
      </div>
    </article>
  )
}

/** Loading state: bar in the sunken colour and three skeleton lines. */
export function StoryItemSkeleton({ size = 'standard' }: { size?: 'standard' | 'wide' }) {
  return (
    <div aria-hidden className={cx('flex flex-col gap-3', size === 'wide' && 'md:col-span-2')}>
      <Skeleton className="h-bar w-full" />
      <Skeleton className="h-8 w-4/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  )
}
