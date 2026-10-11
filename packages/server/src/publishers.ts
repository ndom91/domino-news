import { type Db, schema } from '@dn/db'
import type {
  CoverageProfile,
  PublisherDetail,
  PublisherLean,
  PublisherListResponse,
  PublisherRef,
  PublisherStats,
} from '@dn/schemas'
import { eq, sql } from 'drizzle-orm'
import { latestAssessment } from './assessments.ts'
import { storyListItems } from './reader.ts'

// Coverage is measured over published Stories and their active source articles.
// "First" = the outlet whose article has the earliest report time in that Story.
// Official sources (agencies, courts) count as coverage but never compete with
// newsrooms for "first" or "only source".
const LINKS = sql`
  links as (
    select sa.story_id, a.publisher_id, coalesce(a.published_at, a.first_seen_at) as at,
      p.kind = 'newsroom' as newsroom
    from story_article sa
    join article a on a.id = sa.article_id
    join publisher p on p.id = a.publisher_id
    join story s on s.id = sa.story_id
    where sa.removed_at is null and s.published_at is not null
  ),
  per_story as (
    select story_id, min(at) as first_at, count(distinct publisher_id)::int as outlets
    from links where newsroom group by story_id
  )`

type StatsRow = {
  id: string
  slug: string
  name: string
  domain: string
  country_code: string | null
  article_body_policy: 'metadata_only' | 'transient_body_allowed'
  kind: 'newsroom' | 'official'
  license: string | null
  stories: number
  first_reports: number
  exclusives: number
  article_count: number
  last_seen: Date | null
  lean: PublisherLean | null
  lean_country: string | null
}

async function statsRows(db: Db, slug?: string) {
  const { rows } = await db.execute<StatsRow>(sql`
    with ${LINKS},
    per_pub as (
      select l.publisher_id,
        count(distinct l.story_id)::int as stories,
        count(distinct l.story_id) filter (where l.newsroom and l.at = ps.first_at)::int as first_reports,
        count(distinct l.story_id) filter (where l.newsroom and ps.outlets = 1)::int as exclusives
      from links l left join per_story ps using (story_id)
      group by l.publisher_id
    ),
    per_article as (
      select publisher_id, count(*)::int as article_count, max(first_seen_at) as last_seen
      from article group by publisher_id
    )
    select p.id, p.slug, p.name, p.domain, p.country_code, p.article_body_policy, p.kind, p.license,
      coalesce(pp.stories, 0) as stories,
      coalesce(pp.first_reports, 0) as first_reports,
      coalesce(pp.exclusives, 0) as exclusives,
      coalesce(pa.article_count, 0) as article_count,
      pa.last_seen,
      la.lean, coalesce(la.country_context, p.country_code) as lean_country
    from publisher p
    left join per_pub pp on pp.publisher_id = p.id
    left join per_article pa on pa.publisher_id = p.id
    left join lateral (
      select lean, country_context from publisher_assessment
      where publisher_id = p.id order by reviewed_at desc limit 1
    ) la on true
    ${slug ? sql`where p.slug = ${slug}` : sql``}
    order by stories desc, p.name`)
  return rows.map(
    (r): PublisherStats => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      domain: r.domain,
      countryCode: r.country_code,
      bodyPolicy: r.article_body_policy,
      kind: r.kind,
      license: r.license,
      storiesCovered: r.stories,
      firstReports: r.first_reports,
      exclusives: r.exclusives,
      articleCount: r.article_count,
      lastSeenAt: r.last_seen ? new Date(r.last_seen).toISOString() : null,
      lean: r.lean,
      leanCountry: r.lean ? r.lean_country : null,
    }),
  )
}

const MATRIX_STORIES = 12

/** Most widely covered recent Stories × outlets: who covered what, and who was first. */
async function coverageMatrix(db: Db, publishers: PublisherRef[]) {
  const { rows } = await db.execute<{
    story_id: string
    publisher_id: string
    first: boolean
  }>(sql`
    with ${LINKS},
    top as (
      select ps.story_id from per_story ps
      join story s on s.id = ps.story_id
      where ps.outlets > 1
      order by ps.outlets desc, s.last_updated_at desc
      limit ${MATRIX_STORIES}
    )
    select distinct l.story_id, l.publisher_id, bool_or(l.at = ps.first_at) over (partition by l.story_id, l.publisher_id) as first
    from links l join per_story ps using (story_id)
    where l.newsroom and l.story_id in (select story_id from top)`)
  const storyIds = [...new Set(rows.map((r) => r.story_id))]
  const stories = await storyListItems(db, storyIds)
  const covered = new Set(rows.map((r) => r.publisher_id))
  return {
    publishers: publishers.filter((p) => covered.has(p.id)),
    stories: stories
      .sort(
        (a, b) => b.sourceCount - a.sourceCount || b.lastUpdatedAt.localeCompare(a.lastUpdatedAt),
      )
      .map((s) => ({
        id: s.id,
        slug: s.slug,
        title: s.title,
        lastUpdatedAt: s.lastUpdatedAt,
        coverage: rows
          .filter((r) => r.story_id === s.id)
          .map((r) => ({ publisherId: r.publisher_id, first: r.first })),
      })),
  }
}

export async function listPublishers(db: Db): Promise<PublisherListResponse> {
  const items = await statsRows(db)
  const refs = items.map(({ id, slug, name, domain }) => ({ id, slug, name, domain }))
  return { items, matrix: await coverageMatrix(db, refs) }
}

export async function publisherDomainBySlug(db: Db, slug: string): Promise<string | null> {
  const [p] = await db
    .select({ domain: schema.publisher.domain })
    .from(schema.publisher)
    .where(eq(schema.publisher.slug, slug))
  return p?.domain ?? null
}

export async function getPublisher(db: Db, slug: string): Promise<PublisherDetail | null> {
  const [[stats], [publisher]] = await Promise.all([
    statsRows(db, slug),
    db.select().from(schema.publisher).where(eq(schema.publisher.slug, slug)),
  ])
  if (!stats || !publisher) return null

  const [recentStories, shared, profile, assessment] = await Promise.all([
    db
      .execute<{ id: string }>(sql`
        select s.id from story s
        where s.published_at is not null and exists (
          select 1 from story_article sa join article a on a.id = sa.article_id
          where sa.story_id = s.id and sa.removed_at is null and a.publisher_id = ${publisher.id}
        )
        order by s.last_updated_at desc
        limit 20`)
      .then(({ rows }) =>
        storyListItems(
          db,
          rows.map((r) => r.id),
        ),
      ),
    db.execute<{
      id: string
      slug: string
      name: string
      domain: string
      shared: number
    }>(sql`
      with ${LINKS}
      select p.id, p.slug, p.name, p.domain, count(distinct l1.story_id)::int as shared
      from links l1
      join links l2 on l2.story_id = l1.story_id and l2.publisher_id <> l1.publisher_id
      join publisher p on p.id = l2.publisher_id
      where l1.publisher_id = ${publisher.id}
      group by p.id
      order by shared desc, p.name
      limit 8`),
    coverageProfile(db, publisher.id),
    latestAssessment(db, publisher.id),
  ])

  return {
    ...stats,
    profile,
    assessment,
    languages: publisher.languages,
    policyNote: publisher.policyNote,
    policyReviewedAt: publisher.policyReviewedAt?.toISOString() ?? null,
    recentStories,
    coCoverage: shared.rows.map(({ shared: sharedStories, ...ref }) => ({
      publisher: ref,
      sharedStories,
    })),
  }
}

const PROFILE_DAYS = 30
// "Widely covered" = this many newsrooms or more, within the last week.
const MAJOR_OUTLETS = 4

/** What an outlet covers compared with everyone, over the last PROFILE_DAYS. Facts only. */
async function coverageProfile(db: Db, publisherId: string): Promise<CoverageProfile> {
  const window = sql`now() - make_interval(days => ${PROFILE_DAYS})`
  const { rows: stories } = await db.execute<{
    desk: string | null
    regions: string[]
    mine: boolean
    official: boolean
  }>(sql`
    select s.desk, s.regions,
      exists (select 1 from story_article sa join article a on a.id = sa.article_id
        where sa.story_id = s.id and sa.removed_at is null and a.publisher_id = ${publisherId}) as mine,
      exists (select 1 from story_article sa join article a on a.id = sa.article_id
        join publisher p on p.id = a.publisher_id
        where sa.story_id = s.id and sa.removed_at is null and p.kind = 'official') as official
    from story s
    where s.published_at > ${window} and s.merged_into_story_id is null`)
  const mine = stories.filter((s) => s.mine)

  const mix = (keysOf: (s: (typeof stories)[number]) => string[]) => {
    const count = (list: typeof stories) => {
      const m = new Map<string, number>()
      for (const s of list) for (const k of keysOf(s)) m.set(k, (m.get(k) ?? 0) + 1)
      return m
    }
    const own = count(mine)
    const all = count(stories)
    return [...all.entries()]
      .map(([key, n]) => ({
        key,
        share: mine.length ? (own.get(key) ?? 0) / mine.length : 0,
        overallShare: stories.length ? n / stories.length : 0,
      }))
      .sort((a, b) => b.share - a.share || b.overallShare - a.overallShare)
  }

  const { rows: missed } = await db.execute<{ id: string; slug: string; title: string }>(sql`
    with outlets as (
      select sa.story_id, count(distinct a.publisher_id) as n,
        bool_or(a.publisher_id = ${publisherId}) as mine
      from story_article sa join article a on a.id = sa.article_id
      join publisher p on p.id = a.publisher_id
      where sa.removed_at is null and p.kind = 'newsroom'
      group by sa.story_id
    )
    select s.id, s.slug, s.title from story s join outlets o on o.story_id = s.id
    where s.published_at > now() - interval '7 days' and s.merged_into_story_id is null
      and o.n >= ${MAJOR_OUTLETS} and not o.mine
    order by o.n desc, s.last_updated_at desc`)

  return {
    days: PROFILE_DAYS,
    storyCount: mine.length,
    desks: mix((s) => (s.desk ? [s.desk] : [])),
    regions: mix((s) => s.regions.filter((r) => r !== 'global')),
    officialShare: mine.length ? mine.filter((s) => s.official).length / mine.length : null,
    missedMajor: { count: missed.length, examples: missed.slice(0, 3) },
  }
}
