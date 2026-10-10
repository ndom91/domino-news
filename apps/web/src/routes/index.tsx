import { pickLead, relativeTime } from '@dn/domain'
import { REGION_LABELS, REGIONS, type Region, regionSchema } from '@dn/schemas'
import { Button, cx, Notice, Skeleton, StoryRow } from '@dn/ui'
import {
  useInfiniteQuery,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { RouterLink } from '../components/link.tsx'
import { Page, SectionLabel } from '../components/page.tsx'
import { queries } from '../lib/api.ts'

export const Route = createFileRoute('/')({
  validateSearch: z.object({ region: regionSchema.optional() }),
  loaderDeps: ({ search }) => ({ region: search.region ?? null }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureInfiniteQueryData(queries.storyList(deps.region)),
      context.queryClient.ensureQueryData(queries.narratives()),
    ])
  },
  pendingComponent: FeedSkeleton,
  component: FeedPage,
})

function FeedPage() {
  const { region = null } = Route.useSearch()
  const list = useSuspenseInfiniteQuery(queries.storyList(region))
  const { data: narratives } = useSuspenseQuery(queries.narratives())
  // Client-only: the feed renders without it, then the lead and rail adapt.
  const edition = useQuery(queries.preferences()).data?.edition ?? null
  const stories = list.data.pages.flatMap((p) => p.items)
  const lead = pickLead(stories, region ? null : edition)
  const rest = stories.filter((s) => s.id !== lead?.id)

  if (stories.length === 0 && !region) {
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
          <RegionChips active={region} />
          {stories.length === 0 && region ? (
            <p className="text-text-muted">No stories about {REGION_LABELS[region]} yet.</p>
          ) : null}
          {lead ? <StoryRow story={lead} lead Link={RouterLink} className="pb-8" /> : null}
          {edition && !region ? <EditionRail edition={edition} excludeId={lead?.id} /> : null}
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

function RegionChips({ active }: { active: Region | null }) {
  const chip = (current: boolean) =>
    cx(
      'rounded-full border px-3 py-1 text-xs whitespace-nowrap',
      current
        ? 'border-text bg-text text-surface'
        : 'border-border-strong text-text-secondary hover:text-text',
    )
  return (
    <nav aria-label="Filter by region" className="mb-8 flex gap-2 overflow-x-auto pb-1">
      <Link
        to="/"
        search={{}}
        className={chip(!active)}
        aria-current={!active ? 'page' : undefined}
      >
        All
      </Link>
      {REGIONS.map((r) => (
        <Link
          key={r}
          to="/"
          search={{ region: r }}
          className={chip(active === r)}
          aria-current={active === r ? 'page' : undefined}
        >
          {REGION_LABELS[r]}
        </Link>
      ))}
    </nav>
  )
}

/** Latest Stories in the reader's edition, above the chronological feed. */
function EditionRail({ edition, excludeId }: { edition: Region; excludeId?: string }) {
  const list = useInfiniteQuery(queries.storyList(edition))
  const items = (list.data?.pages[0]?.items ?? []).filter((s) => s.id !== excludeId).slice(0, 5)
  if (items.length === 0) return null
  return (
    <section aria-labelledby="edition-heading" className="mb-10">
      <SectionLabel>
        <span id="edition-heading">In {REGION_LABELS[edition]}</span>
      </SectionLabel>
      <ol className="flex flex-col divide-y divide-border">
        {items.map((story) => (
          <li key={story.id} className="py-4 first:pt-2">
            <StoryRow story={story} Link={RouterLink} />
          </li>
        ))}
      </ol>
      <Link
        to="/"
        search={{ region: edition }}
        className="mt-2 inline-block text-sm text-accent hover:underline"
      >
        More from {REGION_LABELS[edition]}
      </Link>
    </section>
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
