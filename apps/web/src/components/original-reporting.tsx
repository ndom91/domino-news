import { groupReporting, oneSidedCoverage, plural, type ReportingGroup } from '@dn/domain'
import { LEAN_LABELS, type StoryDetail, type StorySource } from '@dn/schemas'
import {
  Badge,
  Button,
  LeanBar,
  type LeanCounts,
  PublisherLogo,
  SectionHeader,
  Timestamp,
} from '@dn/ui'
import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { RouterLink } from './link.tsx'

const GROUP_SHOWN = 2
const TIME_SHOWN = 5
const GROUP_BORDER: Record<ReportingGroup, string> = {
  left: 'border-lean-left',
  centre_left: 'border-lean-centre-left',
  centre: 'border-text-muted',
  centre_right: 'border-lean-centre-right',
  right: 'border-lean-right',
  unrated: 'border-border-strong',
}

export function OriginalReporting({
  story,
  active,
  onActiveChange,
}: {
  story: StoryDetail
  active: 'lean' | 'time'
  onActiveChange: (view: 'lean' | 'time') => void
}) {
  const [expanded, setExpanded] = useState<ReportingGroup[]>([])
  const [showAll, setShowAll] = useState(false)
  const { ordered, ratings, groups } = groupReporting(story.sources, story.leanMix)
  const publisherCount = new Set(ordered.map((source) => source.publisher.id)).size
  const counts: LeanCounts = {}
  for (const { group, publishers } of groups) counts[group] = publishers
  const sourced = [...ratings.values()].filter((rating) => !rating.estimated)
  const oneSided = oneSidedCoverage(sourced.map((rating) => rating.lean))
  const hasHidden =
    active === 'time'
      ? ordered.length > TIME_SHOWN
      : groups.some(({ items }) => items.length > GROUP_SHOWN)

  // A citation must reach its report even when its group or time list is collapsed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a view change can hide the current citation target.
  useEffect(() => {
    function reveal() {
      let id: string
      try {
        id = decodeURIComponent(window.location.hash.slice(1))
      } catch {
        return
      }
      if (!story.sources.some((source) => `report-${source.articleId}` === id)) return
      if (document.getElementById(id)) return
      flushSync(() => setShowAll(true))
      document.getElementById(id)?.scrollIntoView()
    }
    reveal()
    window.addEventListener('hashchange', reveal)
    return () => window.removeEventListener('hashchange', reveal)
  }, [story.sources, active])

  return (
    <section aria-labelledby="sources-heading">
      <SectionHeader
        id="sources-heading"
        rule
        title="Original reporting"
        meta={`${plural(ordered.length, 'report')} from ${plural(publisherCount, 'publisher')}`}
      />
      <div className="mb-6 grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          {publisherCount ? (
            <>
              <LeanBar counts={counts} className="h-3" />
              <p className="sr-only">
                Covering publishers:{' '}
                {groups
                  .map(
                    ({ group, publishers }) =>
                      `${group === 'unrated' ? 'Not rated' : LEAN_LABELS[group]}: ${publishers}`,
                  )
                  .join('; ')}
                .
              </p>
            </>
          ) : null}
          <div className="mt-1 flex justify-between type-meta" aria-hidden>
            <span>Left</span>
            <span>Right</span>
          </div>
          {oneSided ? (
            <p className="mt-3 text-sm font-bold">
              Most publishers with sourced ratings lean {oneSided}.
            </p>
          ) : null}
          <p className="mt-2 max-w-reading text-sm text-text-secondary">
            Lean describes the publisher, not an individual report. Ratings use a shared scale;
            estimates are marked. Open a headline to read it on the publisher’s site.
          </p>
        </div>
        <div>
          <fieldset className="flex border border-border-strong">
            <legend className="sr-only">Original reporting view</legend>
            {(['lean', 'time'] as const).map((view) => (
              <button
                key={view}
                type="button"
                aria-pressed={active === view}
                onClick={() => onActiveChange(view)}
                className={
                  active === view
                    ? 'min-h-tap px-4 text-sm font-semibold bg-text text-surface'
                    : 'min-h-tap px-4 text-sm font-semibold text-text hover:text-accent-text'
                }
              >
                {view === 'lean' ? 'By lean' : 'By time'}
              </button>
            ))}
          </fieldset>
          <p className="mt-2 text-sm text-text-secondary">
            ■ Cited in the summary
            <br />□ Not cited
          </p>
        </div>
      </div>

      {active === 'lean' ? (
        <div id="reports-lean" className="border-t-2 border-rule">
          {groups.map(({ group, items: sources, publishers: count }) => {
            const isExpanded = showAll || expanded.includes(group)
            const visible = isExpanded ? sources : sources.slice(0, GROUP_SHOWN)
            return (
              <section
                key={group}
                aria-labelledby={`report-group-${group}`}
                className="grid border-b-2 border-rule sm:grid-cols-[10rem_minmax(0,1fr)]"
              >
                <div className="py-4 pr-4">
                  <h3 id={`report-group-${group}`} className="type-narrative-title">
                    {group === 'unrated' ? 'Not rated' : LEAN_LABELS[group]}
                  </h3>
                  <p className="mt-1 type-meta">{plural(count, 'publisher')}</p>
                </div>
                <div className={`border-l-4 pl-4 ${GROUP_BORDER[group]}`}>
                  {visible.length ? (
                    <ol id={`reports-${group}`}>
                      {visible.map((source) => (
                        <Report
                          key={source.articleId}
                          source={source}
                          estimated={ratings.get(source.publisher.id)?.estimated ?? false}
                        />
                      ))}
                    </ol>
                  ) : (
                    <p className="py-4 text-sm text-text-muted">No reports in this group.</p>
                  )}
                  {!showAll && sources.length > GROUP_SHOWN ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="my-3"
                      aria-expanded={isExpanded}
                      aria-controls={`reports-${group}`}
                      onClick={() =>
                        setExpanded((current) =>
                          isExpanded
                            ? current.filter((item) => item !== group)
                            : [...current, group],
                        )
                      }
                    >
                      {isExpanded
                        ? 'Show fewer reports'
                        : `Show ${plural(sources.length - GROUP_SHOWN, 'more report')}`}
                    </Button>
                  ) : null}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <ol id="reports-time" className="border-t-2 border-rule">
          {(showAll ? ordered : ordered.slice(0, TIME_SHOWN)).map((source) => (
            <Report
              key={source.articleId}
              source={source}
              estimated={ratings.get(source.publisher.id)?.estimated ?? false}
            />
          ))}
        </ol>
      )}
      {hasHidden ? (
        <Button
          className="mt-4"
          variant="secondary"
          aria-expanded={showAll}
          aria-controls={active === 'lean' ? 'reports-lean' : 'reports-time'}
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? 'Show fewer reports' : `View all ${plural(ordered.length, 'report')}`}
        </Button>
      ) : null}
    </section>
  )
}

function Report({ source, estimated }: { source: StorySource; estimated: boolean }) {
  return (
    <li
      id={`report-${source.articleId}`}
      className="scroll-mt-24 border-b border-border py-4 last:border-b-0"
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <RouterLink
          to={`/publishers/${source.publisher.slug}`}
          className="inline-flex items-center gap-2 text-sm font-bold hover:underline"
        >
          <PublisherLogo slug={source.publisher.slug} size={20} />
          {source.publisher.name}
        </RouterLink>
        {source.official ? <Badge>Official source</Badge> : null}
        {estimated ? <span className="type-meta">Estimated lean</span> : null}
        <span className="type-meta">
          <Timestamp at={source.publishedAt ?? source.observedAt} format="clock" /> ·{' '}
          {source.citation
            ? `■ Cited [${source.citation}]`
            : source.citedInSummary
              ? '■ Cited'
              : '□ Not cited'}
        </span>
      </div>
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="type-headline text-[1.375rem] link-headline"
      >
        {source.title}
        <span className="sr-only"> (opens {source.publisher.domain})</span>
      </a>
      {source.description && source.description !== source.title ? (
        <p className="mt-1.5 line-clamp-3 max-w-reading text-base leading-normal text-text-secondary">
          {source.description}
        </p>
      ) : null}
    </li>
  )
}
