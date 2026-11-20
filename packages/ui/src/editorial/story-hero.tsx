import { plural, summaryParagraphs } from '@dn/domain'
import type { StoryDetail } from '@dn/schemas'
import { type ReactNode, useState } from 'react'
import { cx } from '../cx.ts'
import { SummaryText } from './citation.tsx'
import { deskKey, deskLabel } from './desk-key.ts'
import { DefaultLink, type LinkLike } from './link.tsx'
import { SourceBoard } from './source-board.tsx'
import { SourceTrace } from './source-trace.tsx'
import { Timestamp } from './time.tsx'

/** Story-only composition: the summary remains a continuous reading path beside the board. */
export function StoryHero({
  story,
  now,
  kicker,
  action,
  editAction,
  sidebar,
  children,
  Link = DefaultLink,
}: {
  story: StoryDetail
  now: string
  kicker: string
  action?: ReactNode
  editAction?: ReactNode
  sidebar?: ReactNode
  children?: ReactNode
  Link?: LinkLike
}) {
  const paragraphs = summaryParagraphs(story.summary, story.context)
  const [lead, ...rest] = paragraphs
  const hasSheet = rest.length > 0
  const narrative = story.narratives[0]
  // The complete reporting section is present below the hero at every viewport.
  const citations = new Map(
    story.sources.flatMap((source) =>
      source.citation
        ? [[source.citation, { outlet: source.publisher.name, href: source.url }] as const]
        : [],
    ),
  )
  const provenance = story.summary ? (
    <>
      {story.summary.origin === 'edited' ? 'Edited' : 'Machine-generated'} summary from{' '}
      {new Set(story.sources.filter((s) => s.citedInSummary).map((s) => s.publisher.id)).size} of{' '}
      {plural(new Set(story.sources.map((s) => s.publisher.id)).size, 'publisher')} · Updated{' '}
      <Timestamp at={story.summary.createdAt} />
    </>
  ) : null

  return (
    <div
      className={cx(
        deskKey(story.desk),
        'relative isolate mt-8 grid gap-x-14 px-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_auto_minmax(0,1fr)]',
        'max-lg:-mx-gutter max-lg:mt-4 max-lg:grid-cols-1 max-lg:px-0',
      )}
      data-story-hero
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-key max-lg:hidden lg:row-start-1 lg:row-end-3"
      />
      <div className="col-span-full key-fill pt-9 max-lg:px-gutter max-md:pt-5">
        <div className="mb-7 flex items-center justify-between gap-4 border-b-2 border-key-text pb-3.5 max-md:flex-wrap max-md:gap-y-1">
          {narrative ? (
            <Link to={`/narratives/${narrative.slug}`} className="type-label hover:underline">
              {narrative.title}
            </Link>
          ) : (
            <span className="type-label">{deskLabel(story.desk)}</span>
          )}
          <div className="flex min-w-0 items-center gap-3 max-md:w-full max-md:justify-between">
            <span className="text-base font-semibold">{kicker}</span>
            {action}
          </div>
        </div>
      </div>

      <div className={hasSheet ? 'min-w-0 lg:col-start-1 lg:row-start-2 lg:row-end-4' : 'contents'}>
        <div
          className={cx(
            'key-fill max-lg:px-gutter lg:col-start-1 lg:row-start-2',
            hasSheet ? 'max-lg:pb-19' : 'pb-10',
          )}
        >
          <h1
            id="story-heading"
            className="mb-6.5 type-display-sm md:max-lg:type-display-md max-md:text-[length:var(--dn-text-display-md)]"
          >
            {story.title}
          </h1>
          {lead ? (
            <p data-summary-lead className="max-w-reading text-lg leading-normal max-md:text-md">
              <SummaryText {...lead} sources={citations} inherit />
            </p>
          ) : (
            <p>This story is still being summarised.</p>
          )}
          {!hasSheet && provenance ? (
            <p className="mt-5 max-w-reading border-t border-key-text pt-3 text-xs leading-normal">
              {provenance}
            </p>
          ) : null}
        </div>
        {hasSheet ? (
          <section
            aria-label="Summary continued"
            data-summary-detail
            className="relative mt-8 border-t-6 border-rule bg-canvas px-10 pt-7 pb-6 text-text max-lg:mx-2 max-lg:-mt-13 max-md:px-4 max-md:pt-4.5 max-md:pb-4.5"
          >
            <SummaryUpdating newReports={story.summaryUpdate?.newReports} />
            <div className="max-w-reading text-[calc((var(--dn-text-md)+var(--dn-text-lg))/2)] leading-normal max-md:text-md">
              {rest.map((paragraph, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs belong to a fixed summary version
                <p key={index} className="mt-5 first:mt-0">
                  <SummaryText {...paragraph} sources={citations} />
                </p>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-3 max-md:flex-col max-md:items-start">
              <p className="flex-1 text-xs leading-normal text-text-muted">{provenance}</p>
              {editAction}
            </div>
          </section>
        ) : null}
        <div className={!hasSheet ? 'min-w-0 lg:col-start-1 lg:row-start-3' : undefined}>
          {!hasSheet ? (
            <div className="mt-4 text-text max-lg:px-gutter">
              <SummaryUpdating newReports={story.summaryUpdate?.newReports} />
              {editAction}
            </div>
          ) : null}
          <div className="px-gutter text-text lg:hidden">
            <StoryHeroReporting story={story} now={now} />
          </div>
          <div className="flow-root bg-canvas text-text max-lg:px-gutter">{children}</div>
        </div>
      </div>
      <div className="key-fill min-w-0 pb-10 max-lg:hidden lg:col-start-2 lg:row-start-2">
        <StoryHeroReporting story={story} now={now} onKey />
      </div>
      {sidebar ? (
        <aside className="min-w-0 pt-10 text-text max-lg:px-gutter lg:col-start-2 lg:row-start-3">
          {sidebar}
        </aside>
      ) : null}
    </div>
  )
}

function SummaryUpdating({ newReports }: { newReports?: number }) {
  if (!newReports) return null
  return (
    <p
      role="status"
      className="mb-5 flex items-center gap-2.5 bg-sunken px-3 py-2.5 text-xs leading-normal text-text"
    >
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 bg-accent" />
      <span>
        <strong>{plural(newReports, 'new report')} since this version</strong>{' '}
        <span className="text-text-muted">· updated summary in about a minute</span>
      </span>
    </p>
  )
}

function StoryHeroReporting({
  story,
  now,
  onKey = false,
}: {
  story: StoryDetail
  now: string
  onKey?: boolean
}) {
  const [active, setActive] = useState<string | null>(null)
  const reports = story.sources
    .map((source) => ({
      id: source.articleId,
      outlet: source.publisher.name,
      at: source.publishedAt ?? source.observedAt,
      href: source.url,
      citation: source.citedInSummary ? (source.citation ?? 0) : null,
    }))
    .sort((a, b) => a.at.localeCompare(b.at))
  const publishers = new Set(story.sources.map((s) => s.publisher.id)).size
  const first = reports[0]
  const last = reports.at(-1)
  const hours =
    first && last ? Math.round((Date.parse(last.at) - Date.parse(first.at)) / 3_600_000) : 0
  return (
    <section aria-label="Who reported it" className={onKey ? undefined : 'mt-10'}>
      <h2
        className={cx(
          'mb-3 flex items-baseline justify-between gap-3 type-label',
          !onKey && 'border-b-3 border-accent pb-3',
        )}
      >
        Who reported it
        <span
          className={cx(
            'text-xs font-medium tracking-normal normal-case',
            !onKey && 'text-text-muted',
          )}
        >
          {plural(publishers, 'publisher')}
          {onKey && hours > 0 ? ` · ${plural(hours, 'hour')}` : ''}
        </span>
      </h2>
      {reports.length ? (
        <>
          <SourceTrace
            now={now}
            sources={reports}
            variant="full"
            width="fill"
            rows={3}
            onKey={onKey}
            active={active}
            onActiveChange={setActive}
          />
          <SourceBoard
            sources={onKey ? reports.slice(-8) : reports.slice(0, 4)}
            onKey={onKey}
            idPrefix={onKey ? 'hero-source' : 'mobile-source'}
            legend={onKey}
            active={active}
            onActiveChange={setActive}
          />
          <a
            href="#sources-heading"
            className="mt-2 inline-flex min-h-tap items-center text-sm font-semibold underline decoration-accent underline-offset-4"
          >
            See all {plural(reports.length, 'report')}
          </a>
        </>
      ) : (
        <p className="text-sm">No reports available yet.</p>
      )}
    </section>
  )
}
