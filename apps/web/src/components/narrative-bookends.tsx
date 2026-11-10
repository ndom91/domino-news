import { plural } from '@dn/domain'
import type { NarrativeDetail } from '@dn/schemas'
import { NarrativeGraph } from '@dn/ui'
import { Link } from '@tanstack/react-router'
import { RouterLink } from './link.tsx'

const TIMELINE_BOOKEND_SIZE = 3
const TIMELINE_COLLAPSE_AT = 12

/** Keeps a Story page's development view legible; the Narrative page remains the full record. */
export function NarrativeBookends({
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
  const between = stories.slice(TIMELINE_BOOKEND_SIZE, -TIMELINE_BOOKEND_SIZE)
  const recent = stories.slice(-TIMELINE_BOOKEND_SIZE)
  // A current story between the bookends stays visible, splitting the folded ones around it.
  const at = between.findIndex((story) => story.id === currentStoryId)
  const current = at >= 0 ? between[at] : undefined
  const beforeCurrent = current ? between.slice(0, at) : between
  const afterCurrent = current ? between.slice(at + 1) : []

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
      {current ? (
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
