import { clockTime, formatDate, formatDateTime, plural, stripCitations } from '@dn/domain'
import type { StoryUpdateEvent, StoryUpdatesResponse } from '@dn/schemas'
import { Button, PublisherLogo, SectionHeader } from '@dn/ui'
import { CaretDownIcon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { useId, useState } from 'react'

const STORY_UPDATES_SHOWN = 5

/** "What changed": a story's updates as a timeline, the first few until the reader asks for all. */
export function StoryUpdates({ updates }: { updates: StoryUpdatesResponse }) {
  const [showAllUpdates, setShowAllUpdates] = useState(false)
  if (updates.items.length === 0) return null
  const visibleUpdates = showAllUpdates
    ? updates.items
    : updates.items.slice(0, STORY_UPDATES_SHOWN)
  const multipleUpdateYears =
    new Set(visibleUpdates.map((update) => new Date(update.createdAt).getUTCFullYear())).size > 1
  return (
    <section aria-labelledby="updates-heading">
      <SectionHeader
        id="updates-heading"
        rule
        title="What changed"
        meta={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm normal-case tracking-normal text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 bg-accent" /> Summary revised
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 border-2 border-text" /> Other updates
            </span>
            <span className="font-semibold text-text">
              {plural(updates.items.length, 'update')}
            </span>
          </span>
        }
      />
      <ol
        id="story-updates-list"
        className="relative before:absolute before:top-0 before:bottom-0 before:left-[4.75rem] before:w-px before:bg-text max-sm:before:left-[3.75rem]"
      >
        {visibleUpdates.map((update, index, visible) => (
          <li key={update.id}>
            {index === 0 ||
            new Date(visible[index - 1]?.createdAt ?? update.createdAt)
              .toISOString()
              .slice(0, 10) !== new Date(update.createdAt).toISOString().slice(0, 10) ? (
              <p
                className={`relative bg-canvas pl-[6.25rem] type-label text-text-muted max-sm:pl-[4.75rem] ${index === 0 ? 'py-2' : 'py-4'}`}
              >
                {formatDate(update.createdAt)}
                {multipleUpdateYears ? ` ${new Date(update.createdAt).getUTCFullYear()}` : ''} · UTC
              </p>
            ) : null}
            <div className="relative grid grid-cols-[4.75rem_minmax(0,1fr)] max-sm:grid-cols-[3.75rem_minmax(0,1fr)]">
              <time
                dateTime={update.createdAt}
                title={formatDateTime(update.createdAt)}
                className="pt-4 pr-3"
              >
                <span
                  className={
                    update.kind === 'summary_revision'
                      ? 'block type-numeral tabular-nums'
                      : 'block type-meta font-bold tabular-nums'
                  }
                >
                  {clockTime(update.createdAt)}
                </span>
              </time>
              <span
                aria-hidden
                className={
                  update.kind === 'summary_revision'
                    ? 'absolute top-5 left-[4.75rem] size-2.5 -translate-x-1/2 bg-accent max-sm:left-[3.75rem]'
                    : 'absolute top-5 left-[4.75rem] size-2.5 -translate-x-1/2 border-2 border-text bg-surface max-sm:left-[3.75rem]'
                }
              />
              <div className="min-w-0 border-b border-border py-4 pl-6 max-sm:pl-4">
                {update.kind === 'new_reporting' &&
                update.sources.length &&
                !update.relatedStory &&
                !update.summaryDiff ? (
                  <div className="flex flex-wrap items-center gap-x-4">
                    <span className="type-label text-text-muted">
                      +{plural(update.sources.length, 'source')}
                    </span>
                    <SupportingSources sources={update.sources} />
                  </div>
                ) : (
                  <>
                    <p className="type-label text-text-muted">{UPDATE_LABELS[update.kind]}</p>
                    <p className="mt-2 max-w-reading text-md font-semibold leading-snug">
                      {update.description}
                    </p>
                    <UpdateDetail update={update} />
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {updates.items.length > STORY_UPDATES_SHOWN ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 pl-[6.25rem] max-sm:pl-[4.75rem]">
          <Button
            size="sm"
            variant="secondary"
            aria-expanded={showAllUpdates}
            aria-controls="story-updates-list"
            onClick={() => setShowAllUpdates((show) => !show)}
          >
            {showAllUpdates ? 'Show fewer changes' : `View all ${updates.items.length} changes`}
          </Button>
          {!showAllUpdates ? (
            <span className="type-meta">
              {plural(updates.items.length - STORY_UPDATES_SHOWN, 'earlier update')}
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function UpdateDetail({ update }: { update: StoryUpdateEvent }) {
  const [comparing, setComparing] = useState(false)
  const comparisonId = useId()
  if (!update.sources.length && !update.relatedStory && !update.summaryDiff?.previous) return null
  return (
    <div className="mt-2 max-w-reading text-sm leading-normal">
      <div className="flex flex-wrap items-center gap-x-4">
        <SupportingSources sources={update.sources} />
        {update.summaryDiff?.previous ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={comparing}
            aria-controls={comparisonId}
            onClick={() => setComparing((open) => !open)}
            className="min-h-tap"
          >
            {comparing ? 'Hide comparison' : 'Compare versions'}
            <CaretDownIcon
              size={14}
              weight="bold"
              aria-hidden
              className={`transition-transform duration-(--dn-duration-enter) ${comparing ? 'rotate-180' : ''}`}
            />
          </Button>
        ) : null}
      </div>
      {update.summaryDiff?.previous ? (
        <div
          id={comparisonId}
          data-open={comparing}
          inert={!comparing}
          className="disclosure-panel"
        >
          <div className="disclosure-inner">
            <SummaryVersions summaryDiff={update.summaryDiff} />
          </div>
        </div>
      ) : null}
      {update.relatedStory ? (
        <p className="mt-2 text-text-secondary">
          <Link
            to="/stories/$slug"
            params={{ slug: update.relatedStory.slug }}
            className="link-inline font-semibold"
          >
            {update.relatedStory.title}
          </Link>
        </p>
      ) : null}
    </div>
  )
}

function SupportingSources({ sources }: { sources: StoryUpdateEvent['sources'] }) {
  if (sources.length === 0) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 text-text-secondary">
      {sources.map((source) => (
        <span key={source.url} className="inline-flex items-center gap-1">
          {source.publisher ? <PublisherLogo slug={source.publisher.slug} size={22} /> : null}
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            title={source.title}
            className="hover:text-accent-text"
          >
            {source.publisher?.name ?? source.title}
          </a>
        </span>
      ))}
    </span>
  )
}

// SummaryVersions keeps the complete immutable texts available without turning rewrites into a word diff.
function SummaryVersions({
  summaryDiff,
}: {
  summaryDiff: NonNullable<StoryUpdateEvent['summaryDiff']>
}) {
  if (!summaryDiff.previous) return null
  return (
    <div className="mt-2 flex flex-col gap-4 border-l-2 border-border-strong pl-4">
      <SummaryVersion label="Before" text={summaryDiff.previous} />
      <SummaryVersion label="After" text={summaryDiff.current} />
    </div>
  )
}

function SummaryVersion({ label, text }: { label: string; text: string }) {
  const paragraphs = stripCitations(text).split(/\n\s*\n/)
  return (
    <div>
      <p className="type-label text-text-muted">{label}</p>
      <div className="mt-1 flex flex-col gap-2 text-text-secondary">
        {paragraphs.map((paragraph, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs are positional summary text
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </div>
  )
}

const UPDATE_LABELS: Record<StoryUpdateEvent['kind'], string> = {
  summary_revision: 'Summary revised',
  new_reporting: 'New reporting',
  official_response: 'Official response',
  consequence: 'Consequence',
  new_primary_source: 'Primary document added',
  correction_or_clarification: 'Correction or clarification',
  analysis: 'Analysis',
}
