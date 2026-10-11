import { type Db, schema } from '@dn/db'
import {
  DESK_LABELS,
  type Desk,
  type ForYouReason,
  type ForYouResponse,
  REGION_LABELS,
  type Region,
  type SignalKind,
  TOPIC_LABELS,
  type Topic,
} from '@dn/schemas'
import { inArray, sql } from 'drizzle-orm'
import { learnedWeights, signalLabel, storyFeedback } from './feedback.ts'
import { listFollows } from './follows.ts'
import { getPreferences } from './preferences.ts'
import { storyListItems } from './reader.ts'

// Only recent Stories compete; the window is small enough to rank in memory.
const WINDOW_HOURS = 72
const PAGE_SIZE = 30

// Boosts, strongest first. A follow says more than a broad pick.
const WEIGHT = { narrative: 3, topic: 2, publisher: 1, region: 1, desk: 1 } as const
// A learned weight shows as a reason ("More Climate") once it's this strong.
const LEARNED_REASON_MIN = 0.5

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
    /** Decayed weights from "more / less like this", keyed "kind:key". */
    learned?: ReadonlyMap<string, number>
    /** Display names for learned features (topic, desk, region or narrative). */
    learnedLabel?: (kind: 'topic' | 'desk' | 'region' | 'narrative', key: string) => string
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
  // Learned weights add on top (each already clamped). The strongest positive one that
  // isn't already a reason is shown, so readers see their taps working.
  if (picks.learned?.size) {
    const features = [
      ...c.topics.map((key) => ['topic', key] as const),
      ...(c.desk ? [['desk', c.desk] as const] : []),
      ...c.regions.map((key) => ['region', key] as const),
      ...c.narrativeIds.map((key) => ['narrative', key] as const),
    ]
    let best: { kind: (typeof features)[number][0]; key: string; weight: number } | null = null
    for (const [kind, key] of features) {
      const weight = picks.learned.get(`${kind}:${key}`) ?? 0
      score += weight
      if (weight >= LEARNED_REASON_MIN && (!best || weight > best.weight))
        best = { kind, key, weight }
    }
    const label = best && picks.learnedLabel?.(best.kind, best.key)
    if (label && !reasons.some((r) => r.label === label)) {
      reasons.push({ kind: 'learned', label })
    }
  }
  return { score, reasons }
}

/** The reader's ranked feed. The cursor is an offset into the ranked window. */
export async function getForYou(
  db: Db,
  userId: string,
  opts: { cursor?: string | null } = {},
): Promise<ForYouResponse> {
  const [prefs, follows, learned, feedback] = await Promise.all([
    getPreferences(db, userId),
    listFollows(db, userId),
    learnedWeights(db, userId),
    storyFeedback(db, userId),
  ])
  const learnedNarrativeIds = [...learned.keys()]
    .filter((k) => k.startsWith('narrative:'))
    .map((k) => k.slice('narrative:'.length))
  const narrativeTitles = new Map(
    learnedNarrativeIds.length
      ? (
          await db
            .select({ id: schema.narrative.id, title: schema.narrative.title })
            .from(schema.narrative)
            .where(inArray(schema.narrative.id, learnedNarrativeIds))
        ).map((n) => [n.id, n.title])
      : [],
  )
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
    learned,
    learnedLabel: (kind: SignalKind, key: string) => signalLabel(kind, key, narrativeTitles),
  }
  const personalised =
    prefs.regions.length +
      prefs.desks.length +
      prefs.topics.length +
      follows.items.length +
      learned.size >
    0

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

  // "Less like this" Stories are hidden from the reader's feed until they undo it.
  const ranked = rows
    .filter((r) => feedback.get(r.id) !== 'less')
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
      return story ? [{ story, reasons: p.reasons, feedback: feedback.get(p.id) ?? null }] : []
    }),
    pageInfo: {
      nextCursor: offset + PAGE_SIZE < ranked.length ? String(offset + PAGE_SIZE) : null,
    },
  }
}
