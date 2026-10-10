import { plural } from '@dn/domain'
import { REGION_LABELS, REGIONS, type Region, regionSchema, type StoryListItem } from '@dn/schemas'
import {
  Button,
  HeroStory,
  NarrativeColumn,
  SectionHeader,
  StoryItem,
  StoryItemSkeleton,
} from '@dn/ui'
import {
  useInfiniteQuery,
  useQuery,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useId } from 'react'
import { z } from 'zod'
import { RouterLink } from '../components/link.tsx'
import { queries } from '../lib/api.ts'

export const Route = createFileRoute('/')({
  validateSearch: z.object({ region: regionSchema.optional() }),
  loaderDeps: ({ search }) => ({ region: search.region ?? null }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(queries.front(deps.region)),
      context.queryClient.ensureInfiniteQueryData(queries.storyList(deps.region)),
    ])
  },
  pendingComponent: FeedSkeleton,
  component: FeedPage,
})

// Two wide, four narrow, repeating: rows always fill the 4-column grid.
const isWide = (i: number) => i % 6 < 2

function StoryGrid({ stories, now }: { stories: StoryListItem[]; now: string }) {
  return (
    <section className="grid grid-cols-4 gap-x-grid gap-y-12 max-lg:grid-cols-2 max-md:grid-cols-1">
      {stories.map((story, i) => (
        <StoryItem
          key={story.id}
          story={story}
          size={isWide(i) ? 'wide' : 'standard'}
          now={now}
          Link={RouterLink}
        />
      ))}
    </section>
  )
}

function FeedPage() {
  const { region = null } = Route.useSearch()
  const { data: front } = useSuspenseQuery(queries.front(region))
  const list = useSuspenseInfiniteQuery(queries.storyList(region))
  // Client-only: the edition section appears once preferences load.
  const edition = useQuery(queries.preferences()).data?.edition ?? null
  const now = front.editionAt
  const latest = list.data.pages.flatMap((p) => p.items).filter((s) => s.id !== front.lead?.id)

  return (
    <>
      <div className="mx-auto max-w-page px-gutter">
        {/* The lead headline is the page's h1; without a lead the page still needs one. */}
        {front.lead ? (
          <HeroStory story={front.lead} position={front.leadPosition} now={now} Link={RouterLink} />
        ) : (
          <h1 className="sr-only">Domino News</h1>
        )}

        {edition && !region ? (
          <EditionSection edition={edition} excludeId={front.lead?.id} now={now} />
        ) : null}

        <SectionHeader title="Latest" meta={<RegionFilter active={region} />} id="latest-heading" />
        {latest.length === 0 ? (
          <p className="pb-16 type-meta text-base">
            {region
              ? `No stories about ${REGION_LABELS[region]} in the last 24 hours.`
              : 'No stories in the last 24 hours. The next poll runs within 15 minutes.'}
          </p>
        ) : (
          <StoryGrid stories={latest} now={now} />
        )}
        <div className="pt-12 pb-16">
          {list.hasNextPage ? (
            <Button onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
              Show older stories
            </Button>
          ) : null}
        </div>
      </div>

      {/* -mb-24 cancels the footer's top margin so the two dark bands join. */}
      {front.developing.length > 0 ? (
        <section aria-labelledby="developing-heading" className="-mb-24 bg-band text-band-text">
          <div className="mx-auto max-w-page px-gutter pt-2 pb-15">
            <SectionHeader
              title="Developing"
              meta="Stories linked over time"
              id="developing-heading"
              muted="text-band-muted"
            />
            <div className="grid grid-cols-3 gap-8 max-lg:grid-cols-2 max-md:grid-cols-1">
              {front.developing.map((n) => (
                <NarrativeColumn key={n.id} narrative={n} Link={RouterLink} />
              ))}
            </div>
            <Link
              to="/narratives"
              className="mt-7 inline-flex min-h-tap items-center text-base font-bold underline decoration-accent decoration-2 underline-offset-4"
            >
              All {plural(front.narrativeCount, 'narrative')}
            </Link>
          </div>
        </section>
      ) : null}
    </>
  )
}

/** Region filter as a square native select in the Latest header (works without JS-heavy UI). */
function RegionFilter({ active }: { active: Region | null }) {
  const navigate = useNavigate({ from: '/' })
  const id = useId()
  return (
    <span className="inline-flex items-center gap-2">
      <span className="max-md:hidden">Newest report first ·</span>
      <label htmlFor={id} className="sr-only">
        Region
      </label>
      <select
        id={id}
        value={active ?? ''}
        onChange={(e) =>
          navigate({ search: e.target.value ? { region: e.target.value as Region } : {} })
        }
        className="min-h-9 border-2 border-text bg-canvas px-2 text-label font-semibold text-text"
      >
        <option value="">All regions</option>
        {REGIONS.map((r) => (
          <option key={r} value={r}>
            {REGION_LABELS[r]}
          </option>
        ))}
      </select>
    </span>
  )
}

/** Latest Stories in the reader's edition, above the chronological grid. */
function EditionSection({
  edition,
  excludeId,
  now,
}: {
  edition: Region
  excludeId?: string
  now: string
}) {
  const list = useInfiniteQuery(queries.storyList(edition))
  const items = (list.data?.pages[0]?.items ?? []).filter((s) => s.id !== excludeId).slice(0, 4)
  if (items.length === 0) return null
  return (
    <section aria-labelledby="edition-heading">
      <SectionHeader
        title={`In ${REGION_LABELS[edition]}`}
        id="edition-heading"
        meta={
          <Link
            to="/"
            search={{ region: edition }}
            className="font-semibold underline decoration-accent decoration-2 underline-offset-4"
          >
            More from {REGION_LABELS[edition]}
          </Link>
        }
      />
      <section className="grid grid-cols-4 gap-x-grid gap-y-12 max-lg:grid-cols-2 max-md:grid-cols-1">
        {items.map((story) => (
          <StoryItem key={story.id} story={story} now={now} Link={RouterLink} />
        ))}
      </section>
    </section>
  )
}

function FeedSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading stories"
      className="mx-auto max-w-page px-gutter"
    >
      <div className="mt-8 h-96 bg-sunken" />
      <SectionHeader title="Latest" />
      <div className="grid grid-cols-4 gap-x-grid gap-y-12 max-lg:grid-cols-2 max-md:grid-cols-1">
        <StoryItemSkeleton size="wide" />
        <StoryItemSkeleton size="wide" />
        <StoryItemSkeleton />
        <StoryItemSkeleton />
        <StoryItemSkeleton />
        <StoryItemSkeleton />
      </div>
    </div>
  )
}
