import { formatDate, hostnameOf, plural } from '@dn/domain'
import { REGION_LABELS, type StoryDetail } from '@dn/schemas'
import {
  Badge,
  Button,
  ContextExplanation,
  HeroStory,
  leadCitations,
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
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { z } from 'zod/mini'
import { RouterLink } from '../../components/link.tsx'
import { NarrativeBookends } from '../../components/narrative-bookends.tsx'
import { OriginalReporting } from '../../components/original-reporting.tsx'
import { PreviewTeaser } from '../../components/preview-teaser.tsx'
import { ShareStory } from '../../components/share-story.tsx'
import { StoryLean } from '../../components/story-lean.tsx'
import { StoryUpdates } from '../../components/story-updates.tsx'
import { SummaryEditor } from '../../components/summary-editor.tsx'
import { api, orNotFound, queries } from '../../lib/api.ts'
import { seo } from '../../lib/seo.ts'

const REPORTING_VIEWS = ['lean', 'time'] as const
type ReportingView = (typeof REPORTING_VIEWS)[number]

export const Route = createFileRoute('/stories/$slug')({
  validateSearch: z.object({
    reporting: z.catch(z.optional(z.enum(REPORTING_VIEWS)), undefined),
  }),
  // Another story is a fresh page: no open editor, expanded list or share status carries over.
  remountDeps: ({ params }) => params,
  loader: async ({ context, params }) => {
    // Signed out (e.g. from a shared link): only the public teaser, never the full story.
    if (context.preview) {
      const preview = await orNotFound(
        context.queryClient.ensureQueryData(queries.preview('story', params.slug)),
      )
      return { preview, title: preview.title, now: new Date().toISOString() }
    }
    const [story] = await Promise.all([
      orNotFound(context.queryClient.ensureQueryData(queries.story(params.slug))),
      context.queryClient.prefetchQuery(queries.storyUpdates(params.slug)),
    ])
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
  const editButtonRef = useRef<HTMLButtonElement>(null)
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
        action={<ShareStory story={story} origin={session.origin} />}
      />

      {isAdmin && session.features.summaryEditing && story.summary ? (
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

          <StoryUpdates updates={updates} />

          <OriginalReporting active={reporting} onActiveChange={changeReporting} story={story} />

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
