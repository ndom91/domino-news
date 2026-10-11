import type { Db } from '@dn/db'
import type { Desk, Insights, NarrativeRef, Region } from '@dn/schemas'
import { sql } from 'drizzle-orm'
import { leanMixByStory } from './lean.ts'
import { getPreferences, READ_RETENTION_DAYS } from './preferences.ts'
import { narrativeDesk, storyListItems } from './reader.ts'

// Below this many reads, a reading mix says nothing, so no gaps are shown.
const MIN_READS_FOR_GAPS = 5
// A region or desk needs this many Stories this week to count as "big".
const MIN_WEEK_STORIES = 5
// One-sided Stories: how far back to look, how many to check and how many to show.
const ONE_SIDED_DAYS = 7
const ONE_SIDED_CANDIDATES = 300
const ONE_SIDED_SHOWN = 6

/**
 * Blindspot insights, computed on request from the last READ_RETENTION_DAYS of reads.
 * Nothing about the reader is stored or inferred beyond the reads themselves.
 */
export async function getInsights(
  db: Db,
  userId: string,
  requestCountry: string | null,
): Promise<Insights> {
  const prefs = await getPreferences(db, userId)
  const oneSided = await oneSidedStories(db, prefs.country ?? requestCountry)
  if (!prefs.rememberReads)
    return { enabled: false, readCount: 0, missedDevelopments: [], gaps: [], oneSided }

  const { rows: reads } = await db.execute<{
    story_id: string
    desk: Desk | null
    regions: Region[]
  }>(sql`
    select r.story_id, s.desk, s.regions from reading_event r join story s on s.id = r.story_id
    where r.user_id = ${userId} and r.read_at > now() - make_interval(days => ${READ_RETENTION_DAYS})
      and s.published_at is not null`)

  return {
    enabled: true,
    readCount: reads.length,
    missedDevelopments: await missedDevelopments(db, userId),
    gaps: reads.length >= MIN_READS_FOR_GAPS ? await gaps(db, reads) : [],
    oneSided,
  }
}

/**
 * This week's Stories that one side of a country's media barely covers. With no country
 * known (no preference, no request country), the country with the most such Stories wins.
 */
async function oneSidedStories(db: Db, country: string | null): Promise<Insights['oneSided']> {
  const { rows } = await db.execute<{ id: string }>(sql`
    select id from story
    where published_at > now() - make_interval(days => ${ONE_SIDED_DAYS})
      and merged_into_story_id is null
    order by last_updated_at desc
    limit ${ONE_SIDED_CANDIDATES}`)
  const mixes = await leanMixByStory(
    db,
    rows.map((r) => r.id),
  )
  const found = rows.flatMap(({ id }) =>
    (mixes.get(id) ?? []).filter((m) => m.oneSided).map((lean) => ({ id, lean })),
  )
  let target = country
  if (!target) {
    const counts = new Map<string, number>()
    for (const f of found) counts.set(f.lean.country, (counts.get(f.lean.country) ?? 0) + 1)
    target = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  // Newest first (the candidate order), so the section follows the news.
  const shown = found.filter((f) => f.lean.country === target).slice(0, ONE_SIDED_SHOWN)
  const stories = await storyListItems(
    db,
    shown.map((s) => s.id),
  )
  const byId = new Map(stories.map((s) => [s.id, s]))
  return {
    country: target,
    stories: shown.flatMap((s) => {
      const story = byId.get(s.id)
      return story ? [{ story, lean: s.lean }] : []
    }),
  }
}

/** Narratives you read in, with Stories published since your last read there. */
async function missedDevelopments(db: Db, userId: string) {
  const { rows } = await db.execute<{
    narrative_id: string
    slug: string
    title: string
    story_id: string
    desk: Desk | null
  }>(sql`
    with reads as (
      select story_id, read_at from reading_event
      where user_id = ${userId} and read_at > now() - make_interval(days => ${READ_RETENTION_DAYS})
    ),
    read_narratives as (
      select ns.narrative_id, max(r.read_at) as last_read
      from reads r join narrative_story ns on ns.story_id = r.story_id and ns.removed_at is null
      group by ns.narrative_id
    )
    select narrative.id as narrative_id, narrative.slug, narrative.title, s.id as story_id,
      ${narrativeDesk} as desk
    from read_narratives f
    join narrative on narrative.id = f.narrative_id
    join narrative_story ns on ns.narrative_id = f.narrative_id and ns.removed_at is null
    join story s on s.id = ns.story_id
    where s.published_at > f.last_read and s.merged_into_story_id is null
      and s.id not in (select story_id from reads)
    order by s.last_updated_at desc`)

  const byNarrative = new Map<string, { narrative: NarrativeRef; ids: string[] }>()
  for (const r of rows) {
    const entry = byNarrative.get(r.narrative_id) ?? {
      narrative: { id: r.narrative_id, slug: r.slug, title: r.title, desk: r.desk },
      ids: [],
    }
    entry.ids.push(r.story_id)
    byNarrative.set(r.narrative_id, entry)
  }
  const top = [...byNarrative.values()].sort((a, b) => b.ids.length - a.ids.length).slice(0, 5)
  const stories = await storyListItems(
    db,
    top.flatMap((t) => t.ids.slice(0, 3)),
  )
  const byId = new Map(stories.map((s) => [s.id, s]))
  return top.map((t) => ({
    narrative: t.narrative,
    stories: t.ids.slice(0, 3).flatMap((id) => byId.get(id) ?? []),
  }))
}

/** Regions and desks with many Stories this week that make up little of what you read. */
async function gaps(db: Db, reads: { desk: Desk | null; regions: Region[] }[]) {
  const { rows: week } = await db.execute<{ kind: 'region' | 'desk'; key: string; n: number }>(sql`
    with recent as (
      select desk, regions from story
      where published_at > now() - interval '7 days' and merged_into_story_id is null
    )
    select 'region' as kind, r as key, count(*)::int as n from recent, unnest(regions) r
    where r <> 'global' group by r
    union all
    select 'desk', desk, count(*)::int from recent where desk is not null group by desk`)

  const total = { region: 0, desk: 0 }
  for (const w of week) total[w.kind] += w.n
  const readCounts = new Map<string, number>()
  for (const r of reads) {
    if (r.desk) readCounts.set(`desk:${r.desk}`, (readCounts.get(`desk:${r.desk}`) ?? 0) + 1)
    for (const g of r.regions)
      readCounts.set(`region:${g}`, (readCounts.get(`region:${g}`) ?? 0) + 1)
  }
  return week
    .filter((w) => w.n >= MIN_WEEK_STORIES)
    .map((w) => ({ ...w, yourReads: readCounts.get(`${w.kind}:${w.key}`) ?? 0 }))
    .filter((w) => {
      // A gap: your share of reads is under a third of its share of this week's Stories.
      const weekShare = w.n / Math.max(total[w.kind], 1)
      return w.yourReads / reads.length < weekShare / 3
    })
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((w) => ({
      kind: w.kind,
      key: w.key as Desk | Region,
      storiesThisWeek: w.n,
      yourReads: w.yourReads,
    }))
}
