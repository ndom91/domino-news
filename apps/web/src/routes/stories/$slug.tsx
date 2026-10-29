import {
  clockTime,
  formatDate,
  formatDateTime,
  hostnameOf,
  plural,
  stripCitations,
} from '@dn/domain'
import {
  type NarrativeDetail,
  REGION_LABELS,
  type StoryDetail,
  type StoryUpdateEvent,
} from '@dn/schemas'
import {
  Badge,
  Button,
  ContextExplanation,
  HeroStory,
  leadCitations,
  NarrativeGraph,
  PublisherLogo,
  Reveal,
  relationLabel,
  SectionHeader,
  SectionLabel,
  Skeleton,
  SummaryText,
  Timestamp,
} from '@dn/ui'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { z } from 'zod/mini'
import { RouterLink } from '../../components/link.tsx'
import { OriginalReporting } from '../../components/original-reporting.tsx'
import { PreviewTeaser } from '../../components/preview-teaser.tsx'
import { StoryLean } from '../../components/story-lean.tsx'
import { SummaryEditor } from '../../components/summary-editor.tsx'
import { api, orNotFound, queries } from '../../lib/api.ts'
import { seo } from '../../lib/seo.ts'

const REPORTING_VIEWS = ['lean', 'time'] as const
type ReportingView = (typeof REPORTING_VIEWS)[number]

export const Route = createFileRoute('/stories/$slug')({
  validateSearch: z.object({
    reporting: z.catch(z.optional(z.enum(REPORTING_VIEWS)), undefined),
  }),
  loader: async ({ context, params }) => {
    // Signed out (e.g. from a shared link): only the public teaser, never the full story.
    if (context.preview) {
      const preview = await orNotFound(
        context.queryClient.ensureQueryData(queries.preview('story', params.slug)),
      )
      return { preview, title: preview.title, now: new Date().toISOString() }
    }
    const story = await orNotFound(context.queryClient.ensureQueryData(queries.story(params.slug)))
    await context.queryClient.prefetchQuery(queries.storyUpdates(params.slug))
    // The narrative graph renders in the server HTML instead of as a skeleton.
    const narrative = story.narratives[0]
    if (narrative) await context.queryClient.prefetchQuery(queries.narrative(narrative.slug))
    // Window end for the Source Trace, fixed at load so SSR and hydration agree.
    return { preview: null, title: story.title, now: new Date().toISOString() }
  },
  head: ({ loaderData, match, params }) => {
    const preview = loaderData?.preview
    return seo({
      origin: match.context.session.origin,
      path: match.pathname,
      title: loaderData?.title ?? 'Story',
      description: preview?.description,
      type: 'article',
      image: preview
        ? {
            url: `/api/v1/og/story/${params.slug}.png?v=${encodeURIComponent(preview.version)}`,
            width: 1200,
            height: 630,
            alt: preview.title,
          }
        : undefined,
    })
  },
  component: StoryRoute,
})

function StoryRoute() {
  const { preview } = Route.useLoaderData()
  return preview ? <PreviewTeaser preview={preview} /> : <StoryPage />
}

/**
 * The summary's longer detail, below the lead. Citations lead where the lead's do; a context
 * term gets its popover only where it first appears, counting the lead's summary.
 */
function SummaryDetail({ story, detail }: { story: StoryDetail; detail: string }) {
  const sources = leadCitations(story.sources)
  let shown = story.summary?.body ?? ''
  const paragraphs = detail
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
  return (
    // Two newspaper columns on wide screens: fills the main column at a readable line length.
    <div
      data-summary-detail
      className="mt-10 max-w-reading text-md leading-normal lg:max-w-none lg:columns-2 lg:gap-x-column lg:[column-rule:1px_solid_var(--dn-border)] [&>p+p]:mt-4"
    >
      {paragraphs.map((text, i) => {
        const context = story.context.filter((c) => !shown.includes(c.anchorText))
        shown += `\n${text}`
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs are positional and never reorder
          <p key={i}>
            <SummaryText text={text} sources={sources} context={context} />
          </p>
        )
      })}
    </div>
  )
}

const STORY_UPDATES_SHOWN = 5

function UpdateDetail({ update }: { update: StoryUpdateEvent }) {
  const [comparing, setComparing] = useState(false)
  const comparisonId = useId()
  if (!update.sources.length && !update.relatedStory && !update.summaryDiff?.previous) return null
  return (
    <div className="mt-2 max-w-reading text-sm leading-normal">
      <div className="flex flex-wrap items-center gap-x-4">
        <SupportingSources sources={update.sources} />
        {update.summaryDiff?.previous ? (
          <button
            type="button"
            aria-expanded={comparing}
            aria-controls={comparisonId}
            onClick={() => setComparing((open) => !open)}
            className="inline-flex min-h-tap items-center gap-1 font-semibold text-accent-text hover:underline"
          >
            {comparing ? 'Hide comparison' : 'Compare versions'}
            <span aria-hidden>{comparing ? '⌃' : '⌄'}</span>
          </button>
        ) : null}
      </div>
      {update.summaryDiff?.previous ? (
        <div id={comparisonId} hidden={!comparing}>
          <SummaryVersions summaryDiff={update.summaryDiff} />
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
            className="link-inline"
          >
            {source.publisher?.name ?? source.title}
          </a>
          {source === sources.at(-1) ? null : ', '}
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

const TIMELINE_BOOKEND_SIZE = 3
const TIMELINE_COLLAPSE_AT = 12
const CONNECTED_STORIES_LIMIT = 5

function connectedStories(stories: StoryDetail['related']) {
  const temporal = new Set(['follows', 'responds_to', 'corrects'])
  return stories.toSorted((a, b) => {
    const aTemporal = temporal.has(a.relation)
    const bTemporal = temporal.has(b.relation)
    if (aTemporal !== bTemporal) return aTemporal ? -1 : 1
    return b.lastUpdatedAt.localeCompare(a.lastUpdatedAt) || a.id.localeCompare(b.id)
  })
}

function ConnectedStoryList({ stories }: { stories: StoryDetail['related'] }) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {stories.map((story) => (
        <li key={`${story.id}-${story.relation}-${story.direction}`} className="py-3 first:pt-0">
          <p className="type-label text-text-muted">
            {relationLabel(story.relation, story.direction)}
          </p>
          <Link
            to="/stories/$slug"
            params={{ slug: story.slug }}
            className="mt-1 block type-headline text-[1.25rem] link-headline"
          >
            {story.title}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Keeps a Story page's development view legible; the Narrative page remains the full record. */
function NarrativeBookends({
  narrative,
  currentStoryId,
}: {
  narrative: NarrativeDetail
  currentStoryId: string
}) {
  const stories = [...narrative.stories].sort(
    (a, b) => a.firstObservedAt.localeCompare(b.firstObservedAt) || a.id.localeCompare(b.id),
  )
  if (stories.length <= TIMELINE_COLLAPSE_AT) {
    return (
      <NarrativeGraph narrative={narrative} currentStoryId={currentStoryId} Link={RouterLink} />
    )
  }
  const opening = stories.slice(0, TIMELINE_BOOKEND_SIZE)
  const recent = stories.slice(-TIMELINE_BOOKEND_SIZE)
  const bookendIds = new Set([...opening, ...recent].map((story) => story.id))
  const currentIndex = stories.findIndex((story) => story.id === currentStoryId)
  const current = currentIndex >= 0 ? stories[currentIndex] : undefined
  const between = stories.filter(
    (story) => !bookendIds.has(story.id) && story.id !== currentStoryId,
  )
  const indexById = new Map(stories.map((story, index) => [story.id, index]))
  const beforeCurrent = current
    ? between.filter((story) => (indexById.get(story.id) ?? 0) < currentIndex)
    : between
  const afterCurrent = current
    ? between.filter((story) => (indexById.get(story.id) ?? 0) > currentIndex)
    : []

  return (
    <div>
      <NarrativeGraph
        narrative={narrative}
        currentStoryId={currentStoryId}
        storyIds={opening.map((story) => story.id)}
        Link={RouterLink}
      />
      <TimelineDisclosure
        narrative={narrative}
        currentStoryId={currentStoryId}
        stories={beforeCurrent}
      />
      {current && !bookendIds.has(current.id) ? (
        <NarrativeGraph
          narrative={narrative}
          currentStoryId={currentStoryId}
          storyIds={[current.id]}
          Link={RouterLink}
        />
      ) : null}
      <TimelineDisclosure
        narrative={narrative}
        currentStoryId={currentStoryId}
        stories={afterCurrent}
      />
      <NarrativeGraph
        narrative={narrative}
        currentStoryId={currentStoryId}
        storyIds={recent.map((story) => story.id)}
        Link={RouterLink}
      />
      <Link
        to="/narratives/$slug"
        params={{ slug: narrative.slug }}
        className="mt-5 inline-block link-inline text-sm font-semibold"
      >
        View full narrative
      </Link>
    </div>
  )
}

function TimelineDisclosure({
  narrative,
  currentStoryId,
  stories,
}: {
  narrative: NarrativeDetail
  currentStoryId: string
  stories: NarrativeDetail['stories']
}) {
  if (stories.length === 0) return null
  return (
    <details className="t-acc border-b border-border px-3 py-4">
      <summary className="cursor-pointer font-semibold text-text-secondary underline underline-offset-3 hover:text-accent-text">
        Show {plural(stories.length, 'intervening development')}
      </summary>
      <div className="mt-4">
        <NarrativeGraph
          narrative={narrative}
          currentStoryId={currentStoryId}
          storyIds={stories.map((story) => story.id)}
          Link={RouterLink}
        />
      </div>
    </details>
  )
}

function StoryPage() {
  const { slug } = Route.useParams()
  const { reporting = 'lean' } = Route.useSearch()
  const navigate = Route.useNavigate()
  const changeReporting = useCallback(
    (next: ReportingView) =>
      navigate({
        search: { reporting: next === 'lean' ? undefined : next },
        replace: true,
        resetScroll: false,
      }),
    [navigate],
  )
  const { now } = Route.useLoaderData()
  const { session } = Route.useRouteContext()
  // Summary versions are an editorial detail; readers only see the current summary.
  const isAdmin = session.user?.isAdmin ?? false
  const { data: story } = useSuspenseQuery(queries.story(slug))
  const { data: updates } = useSuspenseQuery(queries.storyUpdates(slug))
  // Opt-in reading history, recorded from the browser so SSR and prefetches don't count.
  // Best effort: a lost read only makes the Blindspot insights slightly less complete.
  const rememberReads = session.user?.rememberReads ?? false
  useEffect(() => {
    if (rememberReads) api.recordRead(story.id).catch(() => {})
  }, [rememberReads, story.id])
  const [editing, setEditing] = useState(false)
  const [expandedUpdatesFor, setExpandedUpdatesFor] = useState<string | null>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const showAllUpdates = expandedUpdatesFor === story.id
  const visibleUpdates = showAllUpdates
    ? updates.items
    : updates.items.slice(0, STORY_UPDATES_SHOWN)
  const multipleUpdateYears =
    new Set(visibleUpdates.map((update) => new Date(update.createdAt).getUTCFullYear())).size > 1
  const narrativeRef = story.narratives[0]
  const narrative = useQuery({
    ...queries.narrative(narrativeRef?.slug ?? ''),
    enabled: Boolean(narrativeRef),
  })
  const regions = story.regions.map((r) => REGION_LABELS[r]).join(', ')
  const related = connectedStories(story.related)
  const shownRelated = related.slice(0, CONNECTED_STORIES_LIMIT)
  const hiddenRelated = related.slice(CONNECTED_STORIES_LIMIT)

  return (
    // No Page wrapper: the lead block sets its own top spacing, as on the front page.
    <div className="mx-auto max-w-page px-gutter">
      <HeroStory
        story={story}
        now={now}
        headingLevel="h1"
        linkHeadline={false}
        kicker={`First reported ${formatDate(story.firstObservedAt)}${regions ? ` · ${regions}` : ''}`}
        Link={RouterLink}
      />

      {session.features.summaryEditing && story.summary ? (
        <div className="mt-4">
          {editing ? (
            <SummaryEditor
              storyId={story.id}
              summary={story.summary}
              onDone={() => {
                // The editor took focus when it opened; hand it back to the button that opened it.
                flushSync(() => setEditing(false))
                editButtonRef.current?.focus()
              }}
            />
          ) : (
            <Button ref={editButtonRef} size="sm" onClick={() => setEditing(true)}>
              Edit summary
            </Button>
          )}
        </div>
      ) : null}

      <div className="grid gap-x-14 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {story.summary?.detail ? (
            <SummaryDetail story={story} detail={story.summary.detail} />
          ) : null}

          {updates.items.length > 0 ? (
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
                      <p className="relative bg-canvas py-2 pl-[6.25rem] type-label text-text-muted max-sm:pl-[4.75rem]">
                        {formatDate(update.createdAt)}
                        {multipleUpdateYears
                          ? ` ${new Date(update.createdAt).getUTCFullYear()}`
                          : ''}{' '}
                        · UTC
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
                            <p className="type-label text-text-muted">
                              {UPDATE_LABELS[update.kind]}
                            </p>
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
                    onClick={() =>
                      setExpandedUpdatesFor((current) => (current === story.id ? null : story.id))
                    }
                  >
                    {showAllUpdates
                      ? 'Show fewer changes'
                      : `View all ${updates.items.length} changes`}
                  </Button>
                  {!showAllUpdates ? (
                    <span className="type-meta">
                      {plural(updates.items.length - STORY_UPDATES_SHOWN, 'earlier update')}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          <OriginalReporting
            key={story.id}
            active={reporting}
            onActiveChange={changeReporting}
            story={story}
          />

          {narrative.data ? (
            <section aria-labelledby="development-heading">
              <SectionHeader
                id="development-heading"
                rule
                title="How this developed"
                meta={
                  <Link
                    to="/narratives/$slug"
                    params={{ slug: narrative.data.slug }}
                    className="underline underline-offset-3 hover:text-accent-text"
                  >
                    {narrative.data.title}
                  </Link>
                }
              />
              <Reveal>
                <NarrativeBookends narrative={narrative.data} currentStoryId={story.id} />
              </Reveal>
            </section>
          ) : narrativeRef && narrative.isPending ? (
            <Skeleton className="mt-12 h-40 w-full" />
          ) : null}
        </div>

        <aside className="flex flex-col gap-10 pt-12">
          <StoryLean mix={story.leanMix} />

          {story.context.length > 0 ? (
            <section aria-labelledby="background-heading">
              <SectionLabel id="background-heading">Background</SectionLabel>
              <dl className="flex flex-col gap-5 text-sm">
                {story.context.map((item) => (
                  <div key={item.id}>
                    <dt className="font-bold leading-snug">{item.title}</dt>
                    <dd className="mt-1 leading-normal text-text-secondary">
                      <ContextExplanation item={item} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <section aria-labelledby="related-heading">
            <SectionLabel id="related-heading">Connected stories</SectionLabel>
            {story.related.length === 0 ? (
              <p className="text-sm text-text-muted">No connected stories found yet.</p>
            ) : (
              <>
                <ConnectedStoryList stories={shownRelated} />
                {hiddenRelated.length > 0 ? (
                  <details className="t-acc mt-3 border-t border-border pt-3">
                    <summary className="cursor-pointer font-semibold text-text-secondary underline underline-offset-3 hover:text-accent-text">
                      Show{' '}
                      {plural(
                        hiddenRelated.length,
                        'more connected story',
                        'more connected stories',
                      )}
                    </summary>
                    <div className="mt-3">
                      <ConnectedStoryList stories={hiddenRelated} />
                    </div>
                  </details>
                ) : null}
              </>
            )}
          </section>

          <section aria-labelledby="primary-heading">
            <SectionLabel id="primary-heading">Primary sources</SectionLabel>
            {story.primarySources.length === 0 ? (
              <p className="text-sm text-text-muted">
                No primary documents found. We only look for them in articles from publishers that
                let us read the full text.
              </p>
            ) : (
              <ul className="flex flex-col gap-3 text-sm">
                {story.primarySources.map((p) => (
                  <li key={p.id}>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-inline font-semibold"
                    >
                      {p.title ?? hostnameOf(p.url) ?? p.url} ↗
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isAdmin ? (
            <section aria-labelledby="history-heading">
              <SectionLabel id="history-heading">Summary versions</SectionLabel>
              <ol className="flex flex-col gap-2 text-sm">
                {story.summaryHistory.map((v, i) => (
                  <li key={v.versionId} className="flex items-center justify-between gap-3">
                    <Timestamp at={v.createdAt} format="datetime" className="type-meta" />
                    <span className="flex items-center gap-2">
                      {i === 0 ? <Badge tone="ink">Current</Badge> : null}
                      <span className="type-meta">
                        {v.origin === 'edited' ? 'Edited' : 'Generated'}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
