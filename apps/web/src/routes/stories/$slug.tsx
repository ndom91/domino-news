import { formatDateTime, hostnameOf, relativeTime } from '@dn/domain'
import {
  Badge,
  Button,
  NarrativeGraph,
  relationLabel,
  Skeleton,
  SourceList,
  SourceTrace,
  SummaryBlock,
} from '@dn/ui'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { RouterLink } from '../../components/link.tsx'
import { Page, SectionLabel } from '../../components/page.tsx'
import { SummaryEditor } from '../../components/summary-editor.tsx'
import { queries } from '../../lib/api.ts'

export const Route = createFileRoute('/stories/$slug')({
  loader: async ({ context, params }) => {
    const story = await context.queryClient.ensureQueryData(queries.story(params.slug))
    return { title: story.title }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.title} · Domino News` : 'Story' }],
  }),
  component: StoryPage,
})

function StoryPage() {
  const { slug } = Route.useParams()
  const { session } = Route.useRouteContext()
  const { data: story } = useSuspenseQuery(queries.story(slug))
  const [editing, setEditing] = useState(false)
  const outlets = new Set(story.sources.map((s) => s.publisher.id)).size
  const narrativeRef = story.narratives[0]
  const narrative = useQuery({
    ...queries.narrative(narrativeRef?.slug ?? ''),
    enabled: Boolean(narrativeRef),
  })

  return (
    <Page>
      <article className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 max-w-reading">
          <header className="mb-8">
            {narrativeRef ? (
              <Link
                to="/narratives/$slug"
                params={{ slug: narrativeRef.slug }}
                className="text-xs font-medium uppercase tracking-label text-accent hover:underline"
              >
                {narrativeRef.title}
              </Link>
            ) : null}
            <h1 className="mt-2 font-serif text-2xl font-medium leading-tight tracking-tight text-balance md:text-3xl">
              {story.title}
            </h1>
            <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-text-muted">
              <div className="flex gap-1.5">
                <dt>First reported</dt>
                <dd>
                  <time dateTime={story.firstObservedAt}>
                    {formatDateTime(story.firstObservedAt)}
                  </time>
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt>Updated</dt>
                <dd>
                  <time dateTime={story.lastUpdatedAt} title={formatDateTime(story.lastUpdatedAt)}>
                    {relativeTime(story.lastUpdatedAt)}
                  </time>
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="sr-only">Coverage</dt>
                <dd>
                  {story.sources.length} {story.sources.length === 1 ? 'report' : 'reports'} from{' '}
                  {outlets} {outlets === 1 ? 'outlet' : 'outlets'}
                </dd>
              </div>
            </dl>
          </header>

          {story.summary && editing ? (
            <SummaryEditor
              storyId={story.id}
              summary={story.summary}
              onDone={() => setEditing(false)}
            />
          ) : story.summary ? (
            <>
              <SummaryBlock summary={story.summary} sourceCount={story.sources.length} />
              {session.features.summaryEditing ? (
                <div className="mt-4">
                  <Button size="sm" onClick={() => setEditing(true)}>
                    Edit summary
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-text-secondary">A summary has not been generated yet.</p>
          )}

          <section aria-labelledby="coverage-heading" className="mt-12">
            <SectionLabel>
              <span id="coverage-heading">Coverage</span>
            </SectionLabel>
            <SourceTrace
              size="full"
              sources={story.sources.map((s) => ({
                id: s.articleId,
                publisherName: s.publisher.name,
                at: s.publishedAt ?? s.observedAt,
                cited: s.citedInSummary,
              }))}
            />
          </section>

          <section aria-labelledby="sources-heading" className="mt-12">
            <SectionLabel>
              <span id="sources-heading">Original reporting</span>
            </SectionLabel>
            <p className="mb-4 max-w-reading text-sm text-text-secondary">
              Headlines and descriptions as each outlet published them in its feed. Open a link to
              read the full article on the publisher's site.
            </p>
            <SourceList sources={story.sources} />
          </section>

          {narrative.data ? (
            <section aria-labelledby="development-heading" className="mt-12">
              <SectionLabel>
                <span id="development-heading">How this developed</span>
              </SectionLabel>
              <NarrativeGraph
                narrative={narrative.data}
                currentStoryId={story.id}
                Link={RouterLink}
              />
            </section>
          ) : narrativeRef && narrative.isPending ? (
            <Skeleton className="mt-12 h-40 w-full" />
          ) : null}
        </div>

        <aside className="flex flex-col gap-10 lg:pt-16">
          <section aria-labelledby="related-heading">
            <SectionLabel>
              <span id="related-heading">Connected stories</span>
            </SectionLabel>
            {story.related.length === 0 ? (
              <p className="text-sm text-text-muted">No connected stories found yet.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {story.related.map((r) => (
                  <li key={`${r.id}-${r.relation}-${r.direction}`}>
                    <p className="text-xs uppercase tracking-label text-text-muted">
                      {relationLabel(r.relation, r.direction)}
                    </p>
                    <Link
                      to="/stories/$slug"
                      params={{ slug: r.slug }}
                      className="font-serif text-md leading-snug hover:underline underline-offset-4"
                    >
                      {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="primary-heading">
            <SectionLabel>
              <span id="primary-heading">Primary sources</span>
            </SectionLabel>
            {story.primarySources.length === 0 ? (
              <p className="text-sm text-text-muted">
                No primary documents found. They are only extracted from publishers that permit
                article processing.
              </p>
            ) : (
              <ul className="flex flex-col gap-3 text-sm">
                {story.primarySources.map((p) => (
                  <li key={p.id}>
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {p.title ?? hostnameOf(p.url) ?? p.url} ↗
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="history-heading">
            <SectionLabel>
              <span id="history-heading">Summary versions</span>
            </SectionLabel>
            <ol className="flex flex-col gap-2 text-sm">
              {story.summaryHistory.map((v, i) => (
                <li key={v.versionId} className="flex items-center justify-between gap-3">
                  <time dateTime={v.createdAt} className="font-mono text-xs text-text-secondary">
                    {formatDateTime(v.createdAt)}
                  </time>
                  <span className="flex items-center gap-2">
                    {i === 0 ? <Badge tone="accent">Current</Badge> : null}
                    <span className="text-xs text-text-muted">
                      {v.origin === 'edited' ? 'Edited' : 'Generated'}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </article>
    </Page>
  )
}
