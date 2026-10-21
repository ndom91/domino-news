import type { Db } from '@dn/db'
import type { BriefingResponse, ForYouResponse } from '@dn/schemas'
import { getForYou } from './for-you.ts'
import { openBriefing } from './preferences.ts'

const SECTION_SIZE = 6

/**
 * Personalised, time-aware reader home. Release A intentionally derives its change window from
 * Story timestamps; the grounded update-event ledger arrives in Release B.
 */
export async function getBriefing(db: Db, userId: string): Promise<BriefingResponse> {
  const [checkpoint, feed] = await Promise.all([
    openBriefing(db, userId),
    getForYou(db, userId, { limit: 30 }),
  ])
  const since = checkpoint.since?.toISOString() ?? null
  const newer = since ? feed.items.filter((item) => item.story.lastUpdatedAt > since) : feed.items
  const essential = newer.slice(0, 3)
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
        since ? 'What changed since your last briefing' : 'What matters now',
        since
          ? 'Stories with new reporting or a meaningful update since you last opened Briefing.'
          : 'The most important stories in the latest coverage.',
        essential,
      ),
      section(
        'following',
        'Following',
        'Stories in narratives or from publishers you follow.',
        following,
      ),
      section('for_you', 'For you', 'Based on the regions, desks and topics you chose.', personal),
      section(
        'outside',
        'Outside your usual coverage',
        'Important stories beyond your selected interests.',
        outside,
      ),
    ].filter((item) => item.items.length > 0),
  }
}

function section(
  kind: BriefingResponse['sections'][number]['kind'],
  title: string,
  description: string,
  items: ForYouResponse['items'],
) {
  return { kind, title, description, items: items.slice(0, SECTION_SIZE) }
}
