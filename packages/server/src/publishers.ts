import { type Db, schema } from '@dn/db'
import type {
  ArticleBodyPolicy,
  CoverageProfile,
  LeanBasis,
  PublisherDetail,
  PublisherKind,
  PublisherLean,
  PublisherListResponse,
  PublisherStats,
} from '@dn/schemas'
import { eq, inArray, sql } from 'drizzle-orm'
import { latestAssessment } from './assessments.ts'
import { cached, SHARED_TTL_MS } from './cache.ts'
import { storyListItems } from './reader.ts'

// Coverage is measured over published Stories and their active source articles.
// "First" = the outlet whose article has the earliest report time in that Story.
// Official sources (agencies, courts) count as coverage but never compete with
// newsrooms for "first" or "only source".
// With a publisher, only the Stories it covers (with every outlet in them): enough for its own
// stats and co-coverage, without aggregating everyone.
const links = (publisherId?: string) => sql`
  links as (
    select sa.story_id, a.publisher_id, coalesce(a.published_at, a.first_seen_at) as at,
      p.kind = 'newsroom' as newsroom
    from story_article sa
    join article a on a.id = sa.article_id
    join publisher p on p.id = a.publisher_id
    join story s on s.id = sa.story_id
    where sa.removed_at is null and s.published_at is not null
    ${
      publisherId
        ? sql`and sa.story_id in (
            select mine.story_id from story_article mine join article ma on ma.id = mine.article_id
            where mine.removed_at is null and ma.publisher_id = ${publisherId})`
        : sql``
    }
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
  article_body_policy: ArticleBodyPolicy
  kind: PublisherKind
  license: string | null
  stories: number
  first_reports: number
  exclusives: number
  article_count: number
  last_seen: Date | null
  lean: PublisherLean | null
  lean_basis: LeanBasis | null
  lean_country: string | null
}

async function statsRows(db: Db, publisherId?: string) {
  const only = (column: string) =>
    publisherId ? sql`where ${sql.raw(column)} = ${publisherId}` : sql``
  const { rows } = await db.execute<StatsRow>(sql`
    with ${links(publisherId)},
    per_pub as (
      select l.publisher_id,
        count(distinct l.story_id)::int as stories,
        count(distinct l.story_id) filter (where l.newsroom and l.at = ps.first_at)::int as first_reports,
        count(distinct l.story_id) filter (where l.newsroom and ps.outlets = 1)::int as exclusives
      from links l left join per_story ps using (story_id)
      ${only('l.publisher_id')}
      group by l.publisher_id
    ),
    per_article as (
      select publisher_id, count(*)::int as article_count, max(first_seen_at) as last_seen
      from article ${only('publisher_id')} group by publisher_id
    )
    select p.id, p.slug, p.name, p.domain, p.country_code, p.article_body_policy, p.kind, p.license,
      coalesce(pp.stories, 0) as stories,
      coalesce(pp.first_reports, 0) as first_reports,
      coalesce(pp.exclusives, 0) as exclusives,
      coalesce(pa.article_count, 0) as article_count,
      pa.last_seen,
      la.lean, la.lean_basis, coalesce(la.country_context, p.country_code) as lean_country
    from publisher p
    left join per_pub pp on pp.publisher_id = p.id
    left join per_article pa on pa.publisher_id = p.id
    left join lateral (
      select lean, lean_basis, country_context from publisher_assessment
      where publisher_id = p.id order by reviewed_at desc limit 1
    ) la on true
    ${only('p.id')}
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
      leanBasis: r.lean_basis,
      leanCountry: r.lean ? r.lean_country : null,
    }),
  )
}

export async function listPublishers(db: Db): Promise<PublisherListResponse> {
  return { items: await cached('publishers:list', SHARED_TTL_MS, () => statsRows(db)) }
}

export async function publisherDomainBySlug(db: Db, slug: string): Promise<string | null> {
  const [p] = await db
    .select({ domain: schema.publisher.domain })
    .from(schema.publisher)
    .where(eq(schema.publisher.slug, slug))
  return p?.domain ?? null
}

export async function getPublisher(db: Db, slug: string): Promise<PublisherDetail | null> {
  const [publisher] = await db
    .select()
    .from(schema.publisher)
    .where(eq(schema.publisher.slug, slug))
  if (!publisher) return null

  const [[stats], coverage, assessment] = await Promise.all([
    // Stats carry the latest assessment's lean, so they stay uncached with the assessment:
    // a newly published review must show at once.
    statsRows(db, publisher.id),
    // The same for every reader, and only the pipeline changes it. Keyed by id, so slugs
    // that match no publisher never add a key.
    cached(`publisher:${publisher.id}`, SHARED_TTL_MS, () => publisherCoverage(db, publisher.id)),
    latestAssessment(db, publisher.id),
  ])
  if (!stats) return null

  return {
    ...stats,
    profile: coverage.profile,
    assessment,
    languages: publisher.languages,
    policyNote: publisher.policyNote,
    policyReviewedAt: publisher.policyReviewedAt?.toISOString() ?? null,
    recentStories: coverage.recentStories,
    coCoverage: coverage.coCoverage,
  }
}

async function publisherCoverage(db: Db, publisherId: string) {
  const [recentStories, shared, profile] = await Promise.all([
    db
      .execute<{ id: string }>(sql`
        select s.id from story s
        where s.published_at is not null and exists (
          select 1 from story_article sa join article a on a.id = sa.article_id
          where sa.story_id = s.id and sa.removed_at is null and a.publisher_id = ${publisherId}
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
      with ${links(publisherId)}
      select p.id, p.slug, p.name, p.domain, count(distinct l1.story_id)::int as shared
      from links l1
      join links l2 on l2.story_id = l1.story_id and l2.publisher_id <> l1.publisher_id
      join publisher p on p.id = l2.publisher_id
      where l1.publisher_id = ${publisherId}
      group by p.id
      order by shared desc, p.name
      limit 8`),
    coverageProfile(db, publisherId),
  ])
  return {
    recentStories,
    coCoverage: shared.rows.map(({ shared: sharedStories, ...ref }) => ({
      publisher: ref,
      sharedStories,
    })),
    profile,
  }
}

const PROFILE_DAYS = 30
// "Widely covered" = this many newsrooms or more, within the last week.
const MAJOR_OUTLETS = 4

/** What an outlet covers compared with everyone, over the last PROFILE_DAYS. Facts only. */
async function coverageProfile(db: Db, publisherId: string): Promise<CoverageProfile> {
  // One row per Story, newest first: who covered it, by its active articles.
  const { rows: stories } = await db.execute<{
    id: string
    desk: string | null
    regions: string[]
    this_week: boolean
    mine: boolean
    official: boolean
    newsrooms: number
  }>(sql`
    select s.id, s.desk, s.regions,
      s.published_at > now() - interval '7 days' as this_week,
      bool_or(a.publisher_id = ${publisherId}) as mine,
      bool_or(p.kind = 'official') as official,
      count(distinct a.publisher_id) filter (where p.kind = 'newsroom')::int as newsrooms
    from story s
    join story_article sa on sa.story_id = s.id and sa.removed_at is null
    join article a on a.id = sa.article_id
    join publisher p on p.id = a.publisher_id
    where s.published_at > now() - make_interval(days => ${PROFILE_DAYS})
      and s.merged_into_story_id is null
    group by s.id
    order by s.last_updated_at desc`)
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

  // Widely covered this week, and not by this outlet. Rows arrive newest first and the sort
  // is stable, so equally covered Stories stay newest first.
  const missed = stories
    .filter((s) => s.this_week && !s.mine && s.newsrooms >= MAJOR_OUTLETS)
    .sort((a, b) => b.newsrooms - a.newsrooms)
  // Titles only for the examples shown, not for every Story in the window.
  const exampleIds = missed.slice(0, 3).map((s) => s.id)
  const examples = exampleIds.length
    ? await db
        .select({ id: schema.story.id, slug: schema.story.slug, title: schema.story.title })
        .from(schema.story)
        .where(inArray(schema.story.id, exampleIds))
    : []

  return {
    days: PROFILE_DAYS,
    storyCount: mine.length,
    desks: mix((s) => (s.desk ? [s.desk] : [])),
    regions: mix((s) => s.regions.filter((r) => r !== 'global')),
    officialShare: mine.length ? mine.filter((s) => s.official).length / mine.length : null,
    missedMajor: {
      count: missed.length,
      examples: exampleIds.flatMap((id) => examples.filter((e) => e.id === id)),
    },
  }
}
