import { formatDate, plural } from '@dn/domain'
import {
  Button,
  cx,
  deskKey,
  NarrativeActivity,
  NarrativeGraph,
  SectionHeader,
  SectionLabel,
  Timestamp,
} from '@dn/ui'
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { FollowButton } from '../../components/follow-button.tsx'
import { RouterLink } from '../../components/link.tsx'
import { Page } from '../../components/page.tsx'
import { PreviewTeaser } from '../../components/preview-teaser.tsx'
import { orNotFound, queries } from '../../lib/api.ts'
import { seo } from '../../lib/seo.ts'

export const Route = createFileRoute('/narratives/$slug')({
  loader: async ({ context, params }) => {
    // Signed out (e.g. from a shared link): only the public teaser.
    if (context.preview) {
      const preview = await orNotFound(
        context.queryClient.ensureQueryData(queries.preview('narrative', params.slug)),
      )
      return { preview, title: preview.title }
    }
    const n = await orNotFound(context.queryClient.ensureQueryData(queries.narrative(params.slug)))
    await context.queryClient.prefetchQuery(queries.narrativeUpdates(params.slug))
    return { preview: null, title: n.title }
  },
  head: ({ loaderData, match, params }) => {
    const preview = loaderData?.preview
    return seo({
      origin: match.context.session.origin,
      path: match.pathname,
      title: loaderData?.title ?? 'Narrative',
      description: preview?.description,
      image: preview
        ? {
            url: `/api/v1/og/narrative/${params.slug}.png?v=${encodeURIComponent(preview.version)}`,
            width: 1200,
            height: 630,
            alt: preview.title,
          }
        : undefined,
    })
  },
  component: NarrativeRoute,
})

const NARRATIVE_UPDATES_SHOWN = 5

function NarrativeRoute() {
  const { preview } = Route.useLoaderData()
  return preview ? <PreviewTeaser preview={preview} /> : <NarrativePage />
}

function NarrativePage() {
  const { slug } = Route.useParams()
  const { data: narrative } = useSuspenseQuery(queries.narrative(slug))
  const { data: updates } = useSuspenseQuery(queries.narrativeUpdates(slug))
  const [expandedUpdatesFor, setExpandedUpdatesFor] = useState<string | null>(null)
  const showAllUpdates = expandedUpdatesFor === narrative.id
  const first = narrative.stories[0]
  const last = narrative.stories[narrative.stories.length - 1]
  return (
    <Page>
      {/* Header, then the chart (beside it on desktop, under it on mobile), then the timeline. */}
      <div className="grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="max-w-4xl">
          <header className={cx(deskKey(narrative.desk), 'border-t-6 border-key pt-4')}>
            <p className="type-label text-text-muted">Narrative</p>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
              <h1 className="type-headline-lg text-balance">{narrative.title}</h1>
              <FollowButton targetType="narrative" targetId={narrative.id} name={narrative.title} />
            </div>
          </header>
          {narrative.description ? (
            <p className="mt-3 max-w-reading text-md leading-normal text-text-secondary">
              {narrative.description}
            </p>
          ) : null}
          <p className="mt-4 mb-10 type-meta">
            {plural(narrative.stories.length, 'story', 'stories')}
            {first && last
              ? ` · ${formatDate(first.firstObservedAt)} to ${formatDate(last.firstObservedAt)}`
              : ''}
          </p>
        </div>
        <aside
          aria-labelledby="activity-heading"
          className={cx(deskKey(narrative.desk), 'mb-10 lg:row-span-2 lg:mb-0')}
        >
          <SectionLabel id="activity-heading">Stories per day</SectionLabel>
          <NarrativeActivity times={narrative.stories.map((s) => s.firstObservedAt)} />
        </aside>
        <div className="max-w-4xl">
          <div className="border-t-2 border-rule">
            <NarrativeGraph narrative={narrative} Link={RouterLink} />
          </div>
          {updates.items.length > 0 ? (
            <section aria-labelledby="updates-heading">
              <SectionHeader
                id="updates-heading"
                rule
                title="Recent updates"
                meta={plural(updates.items.length, 'update')}
              />
              <ol
                id="narrative-updates-list"
                className="flex max-w-reading flex-col divide-y divide-border border-t border-border"
              >
                {(showAllUpdates
                  ? updates.items
                  : updates.items.slice(0, NARRATIVE_UPDATES_SHOWN)
                ).map((update) => {
                  const story = narrative.stories.find((item) => item.id === update.storyId)
                  return (
                    <li key={update.id} className="py-4 first:pt-3">
                      {story ? (
                        <Link
                          to="/stories/$slug"
                          params={{ slug: story.slug }}
                          className="type-label text-accent-text"
                        >
                          {story.title}
                        </Link>
                      ) : null}
                      <p className="mt-1 text-md font-semibold leading-snug">
                        {update.description}
                      </p>
                      <Timestamp
                        at={update.createdAt}
                        format="datetime"
                        className="mt-1 block type-meta"
                      />
                    </li>
                  )
                })}
              </ol>
              {updates.items.length > NARRATIVE_UPDATES_SHOWN ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-4"
                  aria-expanded={showAllUpdates}
                  aria-controls="narrative-updates-list"
                  onClick={() =>
                    setExpandedUpdatesFor((current) =>
                      current === narrative.id ? null : narrative.id,
                    )
                  }
                >
                  {showAllUpdates ? 'Show fewer updates' : 'View all updates'}
                </Button>
              ) : null}
            </section>
          ) : null}
          <p className="mt-8 max-w-reading text-xs text-text-muted">
            Links between stories are proposed by a language model from the stories' summaries and
            checked for consistent ordering.
          </p>
        </div>
      </div>
    </Page>
  )
}
