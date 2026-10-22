import { formatDate, hostnameOf, plural, stripCitations } from '@dn/domain'
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
  Reveal,
  relationLabel,
  SectionHeader,
  SectionLabel,
  Skeleton,
  SourceList,
  SummaryText,
  Timestamp,
} from '@dn/ui'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { RouterLink } from '../../components/link.tsx'
import { PreviewTeaser } from '../../components/preview-teaser.tsx'
import { StoryLean } from '../../components/story-lean.tsx'
import { SummaryEditor } from '../../components/summary-editor.tsx'
import { api, orNotFound, queries } from '../../lib/api.ts'
import { seo } from '../../lib/seo.ts'

export const Route = createFileRoute('/stories/$slug')({
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

function UpdateDetail({ update }: { update: StoryUpdateEvent }) {
  if (update.summaryDiff) {
    return (
      <div className="mt-3 max-w-reading border-l-2 border-accent pl-4 text-sm leading-normal">
        <p>{update.description}</p>
        <SummaryVersions summaryDiff={update.summaryDiff} />
        <SupportingSources sources={update.sources} />
      </div>
    )
  }
  if (update.relatedStory) {
    return (
      <p className="mt-3 text-sm text-text-secondary">
        <Link
          to="/stories/$slug"
          params={{ slug: update.relatedStory.slug }}
          className="link-inline font-semibold"
        >
          {update.relatedStory.title}
        </Link>
      </p>
    )
  }
  return <SupportingSources sources={update.sources} />
}

function SupportingSources({ sources }: { sources: StoryUpdateEvent['sources'] }) {
  if (sources.length === 0) return null
  return (
    <p className="mt-3 max-w-reading text-sm text-text-secondary">
      <span className="font-semibold text-text">Supported by: </span>
      {sources.map((source) => (
        <span key={source.url}>
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
    </p>
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
    <details className="t-acc mt-3 border-t border-border pt-3">
      <summary className="cursor-pointer font-semibold text-text-secondary underline underline-offset-3 hover:text-accent-text">
        Compare summary versions
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        <SummaryVersion label="Before" text={summaryDiff.previous} />
        <SummaryVersion label="After" text={summaryDiff.current} />
      </div>
    </details>
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

function updateTitle(update: StoryUpdateEvent) {
  switch (update.kind) {
    case 'summary_revision':
      return null
    case 'new_primary_source':
      return 'Primary document added'
    case 'correction_or_clarification':
      return 'Correction or clarification'
    default:
      return update.description
  }
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
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const publisherCount = new Set(story.sources.map((s) => s.publisher.id)).size
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
                meta={plural(updates.items.length, 'update')}
              />
              <ol className="flex max-w-reading flex-col divide-y divide-border border-t border-border">
                {updates.items.map((update) => (
                  <li key={update.id} className="py-4 first:pt-3">
                    {updateTitle(update) ? (
                      <p className="text-md font-semibold leading-snug">{updateTitle(update)}</p>
                    ) : null}
                    <Timestamp
                      at={update.createdAt}
                      format="datetime"
                      className="mt-1 block type-meta"
                    />
                    <UpdateDetail update={update} />
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          <section aria-labelledby="sources-heading">
            <SectionHeader
              id="sources-heading"
              rule
              title="Original reporting"
              meta={`${plural(story.sources.length, 'report')} from ${plural(publisherCount, 'publisher')}`}
            />
            <p className="mb-4 max-w-reading text-sm text-text-secondary">
              Headlines and descriptions as each publisher published them in its feed. Open a link
              to read the full article on the publisher's site.
            </p>
            <SourceList sources={story.sources} Link={RouterLink} />
          </section>

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
