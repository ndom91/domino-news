import type { Db } from '@dn/db'
import {
  DESK_LABELS,
  type Desk,
  type ForYouReason,
  type ForYouResponse,
  REGION_LABELS,
  type Region,
  TOPIC_LABELS,
  type Topic,
} from '@dn/schemas'
import { sql } from 'drizzle-orm'
import { listFollows } from './follows.ts'
import { getPreferences } from './preferences.ts'
import { storyListItems } from './reader.ts'

// Only recent Stories compete; the window is small enough to rank in memory.
const WINDOW_HOURS = 72
const PAGE_SIZE = 30

// Boosts, strongest first. A follow says more than a broad pick.
const WEIGHT = { narrative: 3, topic: 2, publisher: 1, region: 1, desk: 1 } as const

type Candidate = {
  id: string
  desk: Desk | null
  regions: Region[]
  topics: Topic[]
  ageHours: number
  outlets: number
  narrativeIds: string[]
  publisherIds: string[]
}

/**
 * Score one Story for a reader: boosts for what they picked and follow, plus how widely
 * it's covered, minus age. Nothing is filtered out: a big Story outside the reader's
 * picks still ranks, just lower. Returns the score and the reasons shown on the card.
 */
export function scoreStory(
  c: Candidate,
  picks: {
    regions: readonly Region[]
    desks: readonly Desk[]
    topics: readonly Topic[]
    narratives: ReadonlyMap<string, string>
    publishers: ReadonlyMap<string, string>
  },
): { score: number; reasons: ForYouReason[] } {
  const reasons: ForYouReason[] = []
  let score = Math.log2(1 + c.outlets) - c.ageHours / 24
  for (const id of c.narrativeIds) {
    const title = picks.narratives.get(id)
    if (title) {
      score += WEIGHT.narrative
      reasons.push({ kind: 'narrative', label: title })
      break
    }
  }
  const followedOutlets = c.publisherIds.flatMap((id) => picks.publishers.get(id) ?? [])
  if (followedOutlets.length) {
    score += WEIGHT.publisher
    reasons.push({ kind: 'publisher', label: followedOutlets.slice(0, 2).join(', ') })
  }
  const topic = c.topics.find((t) => picks.topics.includes(t))
  if (topic) {
    score += WEIGHT.topic
    reasons.push({ kind: 'topic', label: TOPIC_LABELS[topic] })
  }
  const region = c.regions.find((r) => picks.regions.includes(r))
  if (region) {
    score += WEIGHT.region
    reasons.push({ kind: 'region', label: REGION_LABELS[region] })
  }
  if (c.desk && picks.desks.includes(c.desk)) {
    score += WEIGHT.desk
    reasons.push({ kind: 'desk', label: DESK_LABELS[c.desk] })
  }
  return { score, reasons }
}

/** The reader's ranked feed. The cursor is an offset into the ranked window. */
export async function getForYou(
  db: Db,
  userId: string,
  opts: { cursor?: string | null } = {},
): Promise<ForYouResponse> {
  const [prefs, follows] = await Promise.all([getPreferences(db, userId), listFollows(db, userId)])
  const picks = {
    regions: prefs.regions,
    desks: prefs.desks,
    topics: prefs.topics,
    narratives: new Map(
      follows.items.filter((f) => f.targetType === 'narrative').map((f) => [f.id, f.title]),
    ),
    publishers: new Map(
      follows.items.filter((f) => f.targetType === 'publisher').map((f) => [f.id, f.title]),
    ),
  }
  const personalised =
    prefs.regions.length + prefs.desks.length + prefs.topics.length + follows.items.length > 0

  const { rows } = await db.execute<{
    id: string
    desk: Desk | null
    regions: Region[]
    topics: Topic[]
    age_hours: number
    outlets: number
    narrative_ids: string[]
    publisher_ids: string[]
  }>(sql`
    select s.id, s.desk, s.regions, s.topics,
      extract(epoch from now() - s.last_updated_at) / 3600 as age_hours,
      (select count(distinct a.publisher_id)::int from story_article sa
        join article a on a.id = sa.article_id join publisher p on p.id = a.publisher_id
        where sa.story_id = s.id and sa.removed_at is null and p.kind = 'newsroom') as outlets,
      array(select ns.narrative_id from narrative_story ns
        where ns.story_id = s.id and ns.removed_at is null) as narrative_ids,
      array(select distinct a.publisher_id from story_article sa join article a on a.id = sa.article_id
        where sa.story_id = s.id and sa.removed_at is null) as publisher_ids
    from story s
    where s.published_at is not null and s.merged_into_story_id is null
      and s.last_updated_at > now() - make_interval(hours => ${WINDOW_HOURS})`)

  const ranked = rows
    .map((r) => ({
      id: r.id,
      ...scoreStory(
        {
          id: r.id,
          desk: r.desk,
          regions: r.regions,
          topics: r.topics,
          ageHours: Number(r.age_hours),
          outlets: r.outlets,
          narrativeIds: r.narrative_ids,
          publisherIds: r.publisher_ids,
        },
        picks,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))

  const offset = Math.max(0, Number(opts.cursor) || 0)
  const page = ranked.slice(offset, offset + PAGE_SIZE)
  const stories = await storyListItems(
    db,
    page.map((p) => p.id),
  )
  const byId = new Map(stories.map((s) => [s.id, s]))
  return {
    personalised,
    items: page.flatMap((p) => {
      const story = byId.get(p.id)
      return story ? [{ story, reasons: p.reasons }] : []
    }),
    pageInfo: {
      nextCursor: offset + PAGE_SIZE < ranked.length ? String(offset + PAGE_SIZE) : null,
    },
  }
}
