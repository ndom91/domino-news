import { type Db, schema } from '@dn/db'
import type {
  PublisherDetail,
  PublisherListResponse,
  PublisherRef,
  PublisherStats,
} from '@dn/schemas'
import { eq, sql } from 'drizzle-orm'
import { storyListItems } from './reader.ts'

// Coverage is measured over published Stories and their active source articles.
// "First" = the outlet whose article has the earliest report time in that Story.
const LINKS = sql`
  links as (
    select sa.story_id, a.publisher_id, coalesce(a.published_at, a.first_seen_at) as at
    from story_article sa
    join article a on a.id = sa.article_id
    join story s on s.id = sa.story_id
    where sa.removed_at is null and s.published_at is not null
  ),
  per_story as (
    select story_id, min(at) as first_at, count(distinct publisher_id)::int as outlets
    from links group by story_id
  )`

type StatsRow = {
  id: string
  slug: string
  name: string
  domain: string
  country_code: string | null
  article_body_policy: 'metadata_only' | 'transient_body_allowed'
  stories: number
  first_reports: number
  exclusives: number
  article_count: number
  last_seen: Date | null
}

async function statsRows(db: Db, slug?: string) {
  const { rows } = await db.execute<StatsRow>(sql`
    with ${LINKS},
    per_pub as (
      select l.publisher_id,
        count(distinct l.story_id)::int as stories,
        count(distinct l.story_id) filter (where l.at = ps.first_at)::int as first_reports,
        count(distinct l.story_id) filter (where ps.outlets = 1)::int as exclusives
      from links l join per_story ps using (story_id)
      group by l.publisher_id
    ),
    per_article as (
      select publisher_id, count(*)::int as article_count, max(first_seen_at) as last_seen
      from article group by publisher_id
    )
    select p.id, p.slug, p.name, p.domain, p.country_code, p.article_body_policy,
      coalesce(pp.stories, 0) as stories,
      coalesce(pp.first_reports, 0) as first_reports,
      coalesce(pp.exclusives, 0) as exclusives,
      coalesce(pa.article_count, 0) as article_count,
      pa.last_seen
    from publisher p
    left join per_pub pp on pp.publisher_id = p.id
    left join per_article pa on pa.publisher_id = p.id
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
      storiesCovered: r.stories,
      firstReports: r.first_reports,
      exclusives: r.exclusives,
      articleCount: r.article_count,
      lastSeenAt: r.last_seen ? new Date(r.last_seen).toISOString() : null,
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
    where l.story_id in (select story_id from top)`)
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

export async function getPublisher(db: Db, slug: string): Promise<PublisherDetail | null> {
  const [stats] = await statsRows(db, slug)
  if (!stats) return null
  const [publisher] = await db
    .select()
    .from(schema.publisher)
    .where(eq(schema.publisher.slug, slug))
  if (!publisher) return null

  const { rows: recent } = await db.execute<{ id: string }>(sql`
    select s.id from story s
    where s.published_at is not null and exists (
      select 1 from story_article sa join article a on a.id = sa.article_id
      where sa.story_id = s.id and sa.removed_at is null and a.publisher_id = ${publisher.id}
    )
    order by s.last_updated_at desc
    limit 20`)
  const { rows: shared } = await db.execute<{
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
    limit 8`)

  return {
    ...stats,
    languages: publisher.languages,
    policyNote: publisher.policyNote,
    policyReviewedAt: publisher.policyReviewedAt?.toISOString() ?? null,
    recentStories: await storyListItems(
      db,
      recent.map((r) => r.id),
    ),
    coCoverage: shared.map(({ shared: sharedStories, ...ref }) => ({
      publisher: ref,
      sharedStories,
    })),
  }
}
