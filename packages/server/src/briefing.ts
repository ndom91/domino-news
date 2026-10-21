import type { Db } from '@dn/db'
import type { BriefingResponse, ForYouResponse, StoryUpdateKind } from '@dn/schemas'
import { getForYou } from './for-you.ts'
import { openBriefing } from './preferences.ts'
import { latestStoryUpdatesSince } from './story-updates.ts'

const SECTION_SIZE = 6

/**
 * Personalised, time-aware reader home. The update-event ledger makes returning-reader changes
 * explicit and source-linked; older Stories fall back to their general coverage recency.
 */
export async function getBriefing(db: Db, userId: string): Promise<BriefingResponse> {
  const [checkpoint, feed] = await Promise.all([
    openBriefing(db, userId),
    getForYou(db, userId, { limit: 30 }),
  ])
  const since = checkpoint.since?.toISOString() ?? null
  const updates = since
    ? await latestStoryUpdatesSince(
        db,
        feed.items.map((item) => item.story.id),
        new Date(since),
      )
    : new Map()
  const newer = since ? feed.items.filter((item) => updates.has(item.story.id)) : feed.items
  const fallsBackToRecency = Boolean(since && newer.length === 0)
  const essentialCandidates = fallsBackToRecency
    ? feed.items.filter((item) => item.story.lastUpdatedAt > (since ?? ''))
    : newer
  const essential = essentialCandidates.slice(0, 3)
  const essentialIds = new Set(essential.map((item) => item.story.id))
  const remaining = feed.items.filter((item) => !essentialIds.has(item.story.id))
  const following = remaining.filter((item) =>
    item.reasons.some((reason) => reason.kind === 'narrative' || reason.kind === 'publisher'),
  )
  const followingIds = new Set(following.map((item) => item.story.id))
  const personal = remaining.filter(
    (item) =>
      !followingIds.has(item.story.id) &&
      item.reasons.some((reason) => reason.kind !== 'narrative' && reason.kind !== 'publisher'),
  )
  const personalIds = new Set(personal.map((item) => item.story.id))
  const outside = remaining.filter(
    (item) => !followingIds.has(item.story.id) && !personalIds.has(item.story.id),
  )
  return {
    since,
    openedAt: checkpoint.openedAt.toISOString(),
    personalised: feed.personalised,
    sections: [
      section(
        'essential',
        since && !fallsBackToRecency
          ? 'What changed since your last briefing'
          : since
            ? 'Recent coverage'
            : 'What matters now',
        since && !fallsBackToRecency
          ? 'Stories with new reporting or a meaningful update since you last opened Briefing.'
          : since
            ? 'Recent stories from before the update ledger was available.'
            : 'The most important stories in the latest coverage.',
        essential.map((item) => ({ ...item, update: updates.get(item.story.id) ?? null })),
      ),
      section(
        'following',
        'Following',
        'Stories in narratives or from publishers you follow.',
        following.map((item) => ({ ...item, update: updates.get(item.story.id) ?? null })),
      ),
      section(
        'for_you',
        'For you',
        'Based on the regions, desks and topics you chose.',
        personal.map((item) => ({ ...item, update: updates.get(item.story.id) ?? null })),
      ),
      section(
        'outside',
        'Outside your usual coverage',
        'Important stories beyond your selected interests.',
        outside.map((item) => ({ ...item, update: updates.get(item.story.id) ?? null })),
      ),
    ].filter((item) => item.items.length > 0),
  }
}

function section(
  kind: BriefingResponse['sections'][number]['kind'],
  title: string,
  description: string,
  items: (ForYouResponse['items'][number] & {
    update: { kind: StoryUpdateKind; description: string } | null
  })[],
) {
  return { kind, title, description, items: items.slice(0, SECTION_SIZE) }
}
