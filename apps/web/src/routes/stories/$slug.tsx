import { formatDate, formatDateTime, hostnameOf } from '@dn/domain'
import { REGION_LABELS } from '@dn/schemas'
import {
  Badge,
  Button,
  ClaimList,
  ContextExplanation,
  HeroStory,
  NarrativeGraph,
  Reveal,
  relationLabel,
  SectionHeader,
  Skeleton,
  SourceList,
  Timestamp,
} from '@dn/ui'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { RouterLink } from '../../components/link.tsx'
import { SectionLabel } from '../../components/page.tsx'
import { SummaryEditor } from '../../components/summary-editor.tsx'
import { api, queries } from '../../lib/api.ts'

export const Route = createFileRoute('/stories/$slug')({
  loader: async ({ context, params }) => {
    const story = await context.queryClient.ensureQueryData(queries.story(params.slug))
    // Window end for the Source Trace, fixed at load so SSR and hydration agree.
    return { title: story.title, now: new Date().toISOString() }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.title} · Domino News` : 'Story' }],
  }),
  component: StoryPage,
})

/** Newest extraction time. ISO strings sort chronologically, so a string max is enough. */
const latestAt = (items: { createdAt: string }[]) =>
  items.reduce((latest, item) => (item.createdAt > latest ? item.createdAt : latest), '')

function StoryPage() {
  const { slug } = Route.useParams()
  const { now } = Route.useLoaderData()
  const { session } = Route.useRouteContext()
  const { data: story } = useSuspenseQuery(queries.story(slug))
  // Opt-in reading history, recorded from the browser so SSR and prefetches don't count.
  // Best effort: a lost read only makes the Blindspot insights slightly less complete.
  const rememberReads = useQuery(queries.preferences()).data?.rememberReads ?? false
  useEffect(() => {
    if (rememberReads) api.recordRead(story.id).catch(() => {})
  }, [rememberReads, story.id])
  const [editing, setEditing] = useState(false)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const outlets = new Set(story.sources.map((s) => s.publisher.id)).size
  const narrativeRef = story.narratives[0]
  const narrative = useQuery({
    ...queries.narrative(narrativeRef?.slug ?? ''),
    enabled: Boolean(narrativeRef),
  })
  const regions = story.regions.map((r) => REGION_LABELS[r]).join(', ')

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
          {story.claims.length > 0 ? (
            <section aria-labelledby="claims-heading">
              <SectionHeader
                id="claims-heading"
                title="Claims"
                meta={
                  <>
                    Statements in the reporting, not verified facts ·{' '}
                    <Timestamp at={latestAt(story.claims)} prefix="Extracted" />
                  </>
                }
              />
              <ClaimList claims={story.claims} />
            </section>
          ) : null}

          <section aria-labelledby="sources-heading">
            <SectionHeader
              id="sources-heading"
              title="Original reporting"
              meta={`${story.sources.length} ${story.sources.length === 1 ? 'report' : 'reports'} from ${outlets} ${outlets === 1 ? 'publisher' : 'publishers'}`}
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
                <NarrativeGraph
                  narrative={narrative.data}
                  currentStoryId={story.id}
                  Link={RouterLink}
                />
              </Reveal>
            </section>
          ) : narrativeRef && narrative.isPending ? (
            <Skeleton className="mt-12 h-40 w-full" />
          ) : null}
        </div>

        <aside className="flex flex-col gap-10 pt-12">
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
              <ul className="flex flex-col divide-y divide-border">
                {story.related.map((r) => (
                  <li key={`${r.id}-${r.relation}-${r.direction}`} className="py-3 first:pt-0">
                    <p className="type-label text-text-muted">
                      {relationLabel(r.relation, r.direction)}
                    </p>
                    <Link
                      to="/stories/$slug"
                      params={{ slug: r.slug }}
                      className="mt-1 block type-headline text-[1.25rem] link-headline"
                    >
                      {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
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
                      className="font-semibold underline decoration-accent decoration-2 underline-offset-3"
                    >
                      {p.title ?? hostnameOf(p.url) ?? p.url} ↗
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="history-heading">
            <SectionLabel id="history-heading">Summary versions</SectionLabel>
            <ol className="flex flex-col gap-2 text-sm">
              {story.summaryHistory.map((v, i) => (
                <li key={v.versionId} className="flex items-center justify-between gap-3">
                  <time dateTime={v.createdAt} className="type-meta">
                    {formatDateTime(v.createdAt)}
                  </time>
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
        </aside>
      </div>
    </div>
  )
}
