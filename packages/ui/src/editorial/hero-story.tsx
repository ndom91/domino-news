import type { StoryDetail } from '@dn/schemas'
import { cx } from '../cx.ts'
import { Popover } from '../primitives/overlay.tsx'
import { type CitedSource, SummaryText } from './citation.tsx'
import { deskKey, deskLabel } from './desk-key.ts'
import { DefaultLink, type LinkLike } from './link.tsx'
import { SourceBoard } from './source-board.tsx'
import { SourceTrace } from './source-trace.tsx'
import { Timestamp } from './time.tsx'

const LONG_TITLE = 60 // characters
const BOARD_ROWS = 8 // latest reports on the board; the rest are on the Story page

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
}: {
  story: StoryDetail
  position?: { index: number; total: number } | null
  kicker?: string
  now: string
  headingLevel?: 'h1' | 'h2'
  linkHeadline?: boolean
  Link?: LinkLike
}) {
  const narrative = story.narratives[0]
  const Heading = headingLevel
  const reportedAt = (s: StoryDetail['sources'][number]) => s.publishedAt ?? s.observedAt
  const board = [...story.sources]
    .sort((a, b) => reportedAt(a).localeCompare(reportedAt(b)))
    .slice(-BOARD_ROWS)
  const onBoard = new Set(board.map((s) => s.articleId))
  // Markers jump to the board row; a report too old for the board links to the article itself.
  const cited: Map<number, CitedSource> = new Map(
    story.sources.flatMap((s) =>
      s.citation
        ? [
            [
              s.citation,
              {
                outlet: s.publisher.name,
                href: onBoard.has(s.articleId) ? `#source-${s.articleId}` : s.url,
              },
            ],
          ]
        : [],
    ),
  )
  const citedCount = story.sources.filter((s) => s.citedInSummary).length
  const times = story.sources.map((s) => Date.parse(reportedAt(s)))
  const spanHours = times.length
    ? Math.round((Math.max(...times) - Math.min(...times)) / 3_600_000)
    : 0
  const outlets = story.sources.length
  // Long titles step down a size. The front-page lead shares the Story page's scale: the
  // largest display size crowded out the summary and the source board beside it.
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
      <div className="col-span-full mb-7 flex items-baseline justify-between gap-x-4 border-b-2 border-key-text pb-3.5 max-md:mb-5 max-md:flex-col max-md:gap-1">
        {narrative ? (
          <Link to={`/narratives/${narrative.slug}`} className="type-label hover:underline">
            {narrative.title}
          </Link>
        ) : (
          <span className="type-label">{deskLabel(story.desk)}</span>
        )}
        <span className="text-base font-semibold">
          {kicker}
          {position && position.total > 1 ? ` · story ${position.index} of ${position.total}` : ''}
        </span>
      </div>

      <div className="min-w-0">
        <Heading id="lead-heading" className={cx('mb-6.5', display)}>
          {linkHeadline ? (
            <Link
              to={`/stories/${story.slug}`}
              className="hover:underline hover:decoration-[6px] hover:underline-offset-[10px]"
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
              A summary of what {citedCount} of {outlets}{' '}
              {outlets === 1 ? 'publisher' : 'publishers'} reported, not verified by Domino.{' '}
              {story.summary.origin === 'edited' ? 'Edited' : 'Generated'}{' '}
              <Timestamp at={story.summary.createdAt} />.{' '}
              <Popover
                title="How this summary is made"
                trigger={
                  <button type="button" className="underline underline-offset-3">
                    How it's made
                  </button>
                }
              >
                <p>
                  A language model running on our own hardware writes it from the headlines and
                  descriptions that publishers put in their feeds. It doesn't read or store full
                  articles unless the publisher allows it.
                </p>
                <p className="mt-2">
                  It describes what publishers <em>report</em>. Reported claims are not confirmed
                  facts. Numbers like [1] link to the publisher each statement comes from. Edits
                  create a new version; earlier versions are kept.
                </p>
              </Popover>
            </p>
          </>
        ) : null}
      </div>

      <div className="min-w-0">
        <h2 className="mb-3 flex justify-between gap-3 type-label">
          Who reported it
          <span className="font-medium tracking-normal normal-case">
            {outlets} {outlets === 1 ? 'publisher' : 'publishers'}
            {spanHours > 0 ? ` · ${spanHours} ${spanHours === 1 ? 'hour' : 'hours'}` : ''}
          </span>
        </h2>
        <SourceTrace
          variant="full"
          onKey
          now={now}
          sources={story.sources.map((s) => ({
            id: s.articleId,
            outlet: s.publisher.name,
            at: reportedAt(s),
            citation: s.citedInSummary ? (s.citation ?? 0) : null,
          }))}
        />
        <SourceBoard
          onKey
          sources={board.map((s) => ({
            id: s.articleId,
            outlet: s.publisher.name,
            at: reportedAt(s),
            href: s.url,
            citation: s.citedInSummary ? (s.citation ?? 0) : null,
          }))}
        />
        {outlets > board.length ? (
          <p className="mt-3 text-sm font-semibold">
            {/* On the Story page the full list is further down; elsewhere, go to the Story. */}
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
