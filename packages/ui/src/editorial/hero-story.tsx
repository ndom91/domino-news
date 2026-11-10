import { plural } from '@dn/domain'
import type { StoryLead } from '@dn/schemas'
import { type ReactNode, useState } from 'react'
import { cx } from '../cx.ts'
import { type CitedSource, SummaryText } from './citation.tsx'
import { deskKey, deskLabel } from './desk-key.ts'
import { DefaultLink, type LinkLike } from './link.tsx'
import { type BoardSource, SourceBoard } from './source-board.tsx'
import { SourceTrace } from './source-trace.tsx'
import { Timestamp } from './time.tsx'

const LONG_TITLE = 60 // characters
const BOARD_ROWS = 8 // latest reports; the Story page lists them all

const reportedAt = (s: StoryLead['sources'][number]) => s.publishedAt ?? s.observedAt

/** A Story's reports, oldest first, as the trace and board show them. */
function sortedReports(sources: StoryLead['sources']) {
  return sources
    .map((s) => ({
      id: s.articleId,
      outlet: s.publisher.name,
      at: reportedAt(s),
      href: s.url,
      citation: s.citedInSummary ? (s.citation ?? 0) : null,
    }))
    .sort((a, b) => a.at.localeCompare(b.at))
}

/**
 * Where each `[n]` marker leads: its row on the lead's board, or the article if it's too old
 * for the board. Also used for the Story page's detail below the lead.
 */
export function leadCitations(sources: StoryLead['sources']) {
  const reports = sortedReports(sources)
  const onBoard = new Set(reports.slice(-BOARD_ROWS).map((r) => r.id))
  const cited = new Map<number, CitedSource>()
  for (const r of reports) {
    if (r.citation) {
      cited.set(r.citation, {
        outlet: r.outlet,
        href: onBoard.has(r.id) ? `#source-${r.id}` : r.href,
      })
    }
  }
  return cited
}

/**
 * The lead Story as a block in its Narrative's colour: display headline, cited summary with a
 * provenance note, and "Who reported it" (hour-cell trace + board). Also the Story page header.
 */
export function HeroStory({
  story,
  position,
  kicker = 'Most reported today',
  now,
  headingLevel = 'h1',
  linkHeadline = true,
  Link = DefaultLink,
  action,
}: {
  story: StoryLead
  position?: { index: number; total: number } | null
  kicker?: string
  now: string
  headingLevel?: 'h1' | 'h2'
  linkHeadline?: boolean
  Link?: LinkLike
  action?: ReactNode
}) {
  const narrative = story.narratives[0]
  const Heading = headingLevel
  const reports = sortedReports(story.sources)
  const board = reports.slice(-BOARD_ROWS)
  const cited = leadCitations(story.sources)
  const citedCount = reports.filter((r) => r.citation !== null).length
  const first = reports[0]
  const last = reports.at(-1)
  const spanHours =
    first && last ? Math.round((Date.parse(last.at) - Date.parse(first.at)) / 3_600_000) : 0
  const outlets = story.sources.length
  const long = story.title.length > LONG_TITLE
  const display = long ? 'type-display-sm' : 'type-display-md'

  return (
    <section
      aria-labelledby="lead-heading"
      className={cx(
        deskKey(story.desk),
        'mt-8 grid grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-x-14 key-fill px-10 pt-9 pb-10',
        'max-lg:grid-cols-1 max-lg:gap-y-8',
        'max-md:-mx-gutter max-md:mt-4 max-md:px-gutter max-md:pt-5 max-md:pb-8',
      )}
    >
      <div
        className={cx(
          'col-span-full mb-7 flex justify-between gap-x-4 border-b-2 border-key-text pb-3.5 max-lg:mb-0',
          action ? 'items-center' : 'items-baseline max-md:flex-col max-md:gap-1',
        )}
      >
        {narrative ? (
          <Link to={`/narratives/${narrative.slug}`} className="type-label hover:underline">
            {narrative.title}
          </Link>
        ) : (
          <span className="type-label">{deskLabel(story.desk)}</span>
        )}
        <div className="flex min-w-0 items-center justify-end gap-3">
          <span className="text-right text-base font-semibold">
            {kicker}
            {position && position.total > 1
              ? ` · story ${position.index} of ${position.total}`
              : ''}
          </span>
          {action}
        </div>
      </div>

      <div className="min-w-0">
        <Heading id="lead-heading" className={cx('mb-6.5', display)}>
          {linkHeadline ? (
            <Link
              to={`/stories/${story.slug}`}
              // The cards' fading underline (em-sized, so it scales and skips descenders the same
              // way), in the fill's text colour.
              className="link-headline hover:decoration-key-text"
            >
              {story.title}
            </Link>
          ) : (
            story.title
          )}
        </Heading>
        {story.summary ? (
          <>
            <p className="max-w-reading text-lg leading-normal max-md:text-md">
              <SummaryText
                text={story.summary.body}
                sources={cited}
                context={story.context}
                inherit
              />
            </p>
            <p className="mt-5 max-w-reading border-t border-key-text/45 pt-2.5 text-label leading-normal">
              {story.summary.origin === 'edited' ? 'Edited' : 'Machine-generated'} summary from{' '}
              {citedCount} of {plural(outlets, 'publisher')} · Updated{' '}
              <Timestamp at={story.summary.createdAt} />
            </p>
          </>
        ) : null}
      </div>

      <div className="min-w-0">
        <h2 className="mb-3 flex justify-between gap-3 type-label">
          Who reported it
          <span className="font-medium tracking-normal normal-case">
            {plural(outlets, 'publisher')}
            {spanHours > 0 ? ` · ${plural(spanHours, 'hour')}` : ''}
          </span>
        </h2>
        <TraceAndBoard reports={reports} board={board} now={now} />
        {outlets > board.length ? (
          <p className="mt-3 text-sm font-semibold">
            {/* On the Story page the full list is further down. */}
            {linkHeadline ? (
              <Link to={`/stories/${story.slug}`} className="underline underline-offset-3">
                See all {outlets} reports
              </Link>
            ) : (
              <a href="#sources-heading" className="underline underline-offset-3">
                See all {outlets} reports
              </a>
            )}
          </p>
        ) : null}
      </div>
    </section>
  )
}

/**
 * The trace and board, sharing a hover: pointing at a report in one highlights it in both. The
 * hover state lives here, so pointer moves don't re-render the headline and summary.
 */
function TraceAndBoard({
  reports,
  board,
  now,
}: {
  reports: BoardSource[]
  board: BoardSource[]
  now: string
}) {
  const [active, setActive] = useState<string | null>(null)
  return (
    <>
      <SourceTrace
        variant="full"
        rows={5}
        onKey
        now={now}
        active={active}
        onActiveChange={setActive}
        sources={reports}
      />
      <SourceBoard onKey active={active} onActiveChange={setActive} sources={board} />
    </>
  )
}
