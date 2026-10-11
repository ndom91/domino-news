import {
  Button,
  DominoRun,
  MissingPiece,
  SectionHeader,
  StoryItem,
  StoryItemSkeleton,
} from '@dn/ui'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { useState } from 'react'
import { queries } from '../lib/api.ts'
import { RouterLink } from './link.tsx'

/** Global 404 (the root route's notFoundComponent): the missing piece in a chain of dominoes. */
export function NotFoundPage() {
  const { pathname } = useLocation()
  // Bumping this re-keys the domino row, which knocks it over again.
  const [run, setRun] = useState(0)

  return (
    <div className="mx-auto max-w-page px-gutter pt-6 pb-16 lg:pt-10">
      <div className="grid gap-x-12 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="@container max-lg:order-2">
          <p className="type-label text-text-muted">Error 404 · Page not found</p>
          <h1 className="mt-2 type-masthead text-[13cqi] leading-[0.84] whitespace-nowrap">
            This page fell over
          </h1>
          <p className="mt-6 max-w-[38rem] text-md leading-normal">
            There’s nothing at{' '}
            <code className="box-decoration-clone bg-text px-1.5 font-sans font-semibold break-words text-canvas">
              {pathname}
            </code>
            . One piece of the chain is missing: the page may have moved, been merged into another
            story, or never existed.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <Button variant="primary" nativeButton={false} render={<Link to="/" />}>
              Back to the front page
            </Button>
            <Button nativeButton={false} render={<Link to="/search" />}>
              Search Domino
            </Button>
            <button
              type="button"
              onClick={() => setRun((n) => n + 1)}
              className="inline-flex min-h-tap items-center self-start px-2 font-semibold link-inline sm:px-4"
            >
              Knock them over again
            </button>
          </div>
        </div>

        <div className="flex flex-col bg-accent px-5 pt-4 text-accent-contrast max-lg:order-1 max-lg:-mx-gutter max-lg:mb-8 lg:pb-4">
          <p className="flex justify-between border-b-2 border-accent-contrast pb-2 type-label">
            <span>4 · 0 · 4</span>
            <span>1 piece missing</span>
          </p>
          <MissingPiece className="mt-2 h-auto w-full lg:my-auto" />
        </div>
      </div>

      <DominoRun run={run} className="mt-12 lg:mt-16" />

      <StillStanding />
    </div>
  )
}

/** The three newest stories, from the same query as the front page's Latest list. */
function StillStanding() {
  const list = useInfiniteQuery(queries.storyList())
  const stories = list.data?.pages[0]?.items.slice(0, 3) ?? []
  if (list.isSuccess && stories.length === 0) return null

  return (
    <section aria-labelledby="still-standing-heading">
      <SectionHeader
        id="still-standing-heading"
        title="Meanwhile, still standing"
        meta={
          <Link to="/" className="font-semibold whitespace-nowrap link-inline text-text">
            Front page
          </Link>
        }
      />
      <div className="grid gap-x-column gap-y-12 md:grid-cols-3">
        {list.isSuccess
          ? stories.map((story) => (
              <StoryItem
                key={story.id}
                story={story}
                now={story.lastUpdatedAt}
                showTrace={false}
                showFirstReport={false}
                Link={RouterLink}
              />
            ))
          : [0, 1, 2].map((i) => <StoryItemSkeleton key={i} />)}
      </div>
    </section>
  )
}
