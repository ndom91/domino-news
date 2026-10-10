import { relativeTime } from '@dn/domain'
import type { StoryListItem } from '@dn/schemas'
import { Button, Notice, Skeleton, StoryRow } from '@dn/ui'
import { useSuspenseInfiniteQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { RouterLink } from '../components/link.tsx'
import { Page, SectionLabel } from '../components/page.tsx'
import { queries } from '../lib/api.ts'

export const Route = createFileRoute('/')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureInfiniteQueryData(queries.storyList()),
      context.queryClient.ensureQueryData(queries.narratives()),
    ])
  },
  pendingComponent: FeedSkeleton,
  component: FeedPage,
})

/** Lead = the most widely reported Story updated in the last 48 hours (else the newest). */
function pickLead(stories: StoryListItem[]) {
  const cutoff = Date.now() - 48 * 3_600_000
  const recent = stories.filter((s) => new Date(s.lastUpdatedAt).getTime() >= cutoff)
  return (recent.length > 0 ? recent : stories).reduce<StoryListItem | undefined>(
    (best, s) => (!best || s.sourceCount > best.sourceCount ? s : best),
    undefined,
  )
}

function FeedPage() {
  const list = useSuspenseInfiniteQuery(queries.storyList())
  const { data: narratives } = useSuspenseQuery(queries.narratives())
  const stories = list.data.pages.flatMap((p) => p.items)
  const lead = pickLead(stories)
  const rest = stories.filter((s) => s.id !== lead?.id)

  if (stories.length === 0) {
    return (
      <Page>
        <Notice title="No published stories yet">
          Stories appear here once feeds are ingested and summarised. Run{' '}
          <code>pnpm cli ingest</code> with the worker running, then check progress on the Pipeline
          page.
        </Notice>
      </Page>
    )
  }

  return (
    <Page>
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          {lead ? <StoryRow story={lead} lead Link={RouterLink} className="pb-8" /> : null}
          <SectionLabel>Latest</SectionLabel>
          <ol className="flex flex-col divide-y divide-border">
            {rest.map((story) => (
              <li key={story.id} className="py-6 first:pt-2">
                <StoryRow story={story} Link={RouterLink} />
              </li>
            ))}
          </ol>
          {list.hasNextPage ? (
            <div className="mt-6">
              <Button onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
                Show older stories
              </Button>
            </div>
          ) : null}
        </div>
        <aside aria-labelledby="narratives-heading" className="lg:sticky lg:top-6 lg:self-start">
          <SectionLabel>
            <span id="narratives-heading">Developing narratives</span>
          </SectionLabel>
          {narratives.items.length === 0 ? (
            <p className="text-sm text-text-muted">
              Narratives form when related stories are linked. None yet.
            </p>
          ) : (
            <ol className="flex flex-col gap-5">
              {narratives.items.slice(0, 8).map((n) => (
                <li key={n.id}>
                  <Link
                    to="/narratives/$slug"
                    params={{ slug: n.slug }}
                    className="font-serif text-md leading-snug text-text hover:underline underline-offset-4"
                  >
                    {n.title}
                  </Link>
                  <p className="mt-1 font-mono text-xs text-text-muted">
                    {n.storyCount} stories · updated {relativeTime(n.updatedAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </Page>
  )
}

function FeedSkeleton() {
  return (
    <Page>
      <div
        role="status"
        className="flex max-w-3xl flex-col gap-4"
        aria-busy="true"
        aria-label="Loading stories"
      >
        <Skeleton className="h-10 w-4/5" />
        <Skeleton className="h-10 w-3/5" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="mt-8 h-6 w-2/3" />
        <Skeleton className="h-12 w-full" />
      </div>
    </Page>
  )
}
