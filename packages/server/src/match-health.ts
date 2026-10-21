import type { MatchHealth } from '@dn/schemas'
import { sql } from 'drizzle-orm'
import type { ServerContext } from './context.ts'

const SPLIT_THRESHOLD = 0.9
// Closest pairs returned for the list; the count covers all of them.
const SPLIT_PAIRS_LISTED = 25
// The split-pair search compares embeddings pairwise; the page refreshes every few seconds.
const CACHE_MS = 5 * 60_000
let cached: { at: number; value: MatchHealth } | null = null

type Side = MatchHealth['splitPairs']['worst'][number]['a']

/** Live match quality signals for /pipeline. Cached for 5 minutes per server process. */
export async function getMatchHealth(ctx: Pick<ServerContext, 'db'>): Promise<MatchHealth> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value
  const { db } = ctx

  const { rows: storyRows } = await db.execute<{
    recent: boolean
    total: number
    singletons: number
  }>(sql`
    select s.first_observed_at > now() - interval '7 days' as recent,
      count(*)::int as total,
      count(*) filter (where c.n = 1)::int as singletons
    from story s
    join (select story_id, count(*) as n from story_article where removed_at is null group by story_id) c
      on c.story_id = s.id
    where s.first_observed_at > now() - interval '14 days' and s.merged_into_story_id is null
    group by 1`)
  const window = (recent: boolean) => {
    const r = storyRows.find((x) => x.recent === recent)
    return { total: r?.total ?? 0, singletons: r?.singletons ?? 0 }
  }

  const { rows: placementRows } = await db.execute<{ method: string; n: number }>(sql`
    select match_method as method, count(*)::int as n from story_article
    where added_at > now() - interval '7 days' and removed_at is null
    group by 1`)
  const placed = (m: string) => placementRows.find((r) => r.method === m)?.n ?? 0

  // Choose answers name a story or null; older one-at-a-time answers carry a decision.
  const [model] = (
    await db.execute<{ calls: number; picked: number; none: number; failed: number }>(sql`
      select
        count(*) filter (where r.status = 'succeeded')::int as calls,
        count(*) filter (where i.output->>'storyId' is not null
          or i.output->>'decision' = 'same_development')::int as picked,
        count(*) filter (where r.status = 'succeeded' and i.output->>'storyId' is null
          and coalesce(i.output->>'decision', '') <> 'same_development')::int as none,
        count(*) filter (where r.status = 'failed')::int as failed
      from analysis_run r
      left join interpretation i on i.analysis_run_id = r.id
      where r.operation = 'story_match' and r.started_at > now() - interval '7 days'`)
  ).rows

  const { rows: pairs } = await db.execute<{
    similarity: number
    a_title: string
    a_publisher: string
    a_story: string
    a_slug: string | null
    b_title: string
    b_publisher: string
    b_story: string
    b_slug: string | null
    total: number
  }>(sql`
    with a as (
      select ae.article_id, ae.embedding, sa.story_id, ar.publisher_id,
        coalesce(ar.published_at, ar.first_seen_at) as at
      from article_embedding ae
      join story_article sa on sa.article_id = ae.article_id and sa.removed_at is null
      join article ar on ar.id = ae.article_id
      where coalesce(ar.published_at, ar.first_seen_at) > now() - interval '3 days'
    ), pairs as (
      select x.article_id as a, y.article_id as b, x.story_id as sa, y.story_id as sb,
        1 - (x.embedding <=> y.embedding) as similarity
      from a x join a y
        on x.article_id < y.article_id and x.story_id <> y.story_id
        and x.publisher_id <> y.publisher_id
        and abs(extract(epoch from x.at - y.at)) < 2 * 86400
      where 1 - (x.embedding <=> y.embedding) >= ${SPLIT_THRESHOLD}
    )
    select p.similarity, count(*) over ()::int as total,
      ra.title as a_title, pa.name as a_publisher, s1.title as a_story,
      case when s1.published_at is not null then s1.slug end as a_slug,
      rb.title as b_title, pb.name as b_publisher, s2.title as b_story,
      case when s2.published_at is not null then s2.slug end as b_slug
    from pairs p
    join article aa on aa.id = p.a join article_revision ra on ra.id = aa.latest_revision_id
    join publisher pa on pa.id = aa.publisher_id
    join article ab on ab.id = p.b join article_revision rb on rb.id = ab.latest_revision_id
    join publisher pb on pb.id = ab.publisher_id
    join story s1 on s1.id = p.sa join story s2 on s2.id = p.sb
    order by p.similarity desc
    limit ${SPLIT_PAIRS_LISTED}`)
  const side = (
    title: string,
    publisher: string,
    storyTitle: string,
    storySlug: string | null,
  ): Side => ({
    title,
    publisher,
    storyTitle,
    storySlug,
  })

  const value: MatchHealth = {
    computedAt: new Date().toISOString(),
    stories: { recent: window(true), previous: window(false) },
    placements: {
      newStory: placed('new_story'),
      embedding: placed('embedding'),
      model: placed('llm'),
    },
    model: {
      calls: model?.calls ?? 0,
      pickedStory: model?.picked ?? 0,
      pickedNone: model?.none ?? 0,
      failed: model?.failed ?? 0,
    },
    splitPairs: {
      count: pairs[0]?.total ?? 0,
      threshold: SPLIT_THRESHOLD,
      worst: pairs.map((p) => ({
        similarity: Number(p.similarity),
        a: side(p.a_title, p.a_publisher, p.a_story, p.a_slug),
        b: side(p.b_title, p.b_publisher, p.b_story, p.b_slug),
      })),
    },
  }
  cached = { at: Date.now(), value }
  return value
}
