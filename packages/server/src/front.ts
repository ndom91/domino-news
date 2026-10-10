import { type Db, schema } from '@dn/db'
import { pickLead } from '@dn/domain'
import type { Desk, DevelopingNarrative, FrontPage, Region } from '@dn/schemas'
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { getStory, listStories, MIN_NARRATIVE_STORIES, narrativeDesk } from './reader.ts'

const DAY_MS = 86_400_000
const DEVELOPING_COUNT = 3
const MAX_STEPS = 6

/**
 * Everything on the front page above the Latest grid. The lead is the most widely reported
 * recent Story (in the reader's edition when they set one); Latest is the regular story list.
 */
export async function getFrontPage(
  db: Db,
  opts: { region?: Region; edition?: Region | null; now?: Date } = {},
): Promise<FrontPage> {
  const now = opts.now ?? new Date()
  const since = new Date(now.getTime() - DAY_MS)

  const [stats] = await db
    .select({
      stories: sql<number>`count(distinct ${schema.storyArticle.storyId})::int`,
      publishers: sql<number>`count(distinct ${schema.article.publisherId})::int`,
    })
    .from(schema.storyArticle)
    .innerJoin(schema.article, eq(schema.article.id, schema.storyArticle.articleId))
    .innerJoin(schema.story, eq(schema.story.id, schema.storyArticle.storyId))
    .where(
      and(
        isNull(schema.storyArticle.removedAt),
        isNotNull(schema.story.publishedAt),
        sql`coalesce(${schema.article.publishedAt}, ${schema.article.firstSeenAt}) >= ${since}`,
      ),
    )

  const candidates = await listStories(db, { limit: 30, region: opts.region })
  const leadItem = pickLead(
    candidates.items,
    opts.region ? null : (opts.edition ?? null),
    now.getTime(),
  )
  const lead = leadItem ? await getStory(db, leadItem.id) : null
  const leadNarrative = lead?.narratives[0]
  let leadPosition: FrontPage['leadPosition'] = null
  if (lead && leadNarrative) {
    const members = await narrativeStoryIds(db, [leadNarrative.id])
    const ids = members.get(leadNarrative.id) ?? []
    leadPosition = { index: ids.indexOf(lead.id) + 1, total: ids.length }
  }

  const recent = await db
    .select({
      id: schema.narrative.id,
      slug: schema.narrative.slug,
      title: schema.narrative.title,
      desk: narrativeDesk,
      updatedAt: schema.narrative.updatedAt,
    })
    .from(schema.narrative)
    .where(
      sql`(select count(*) from ${schema.narrativeStory} ns join ${schema.story} s on s.id = ns.story_id
        where ns.narrative_id = ${schema.narrative.id} and ns.removed_at is null and s.published_at is not null) >= ${MIN_NARRATIVE_STORIES}`,
    )
    .orderBy(desc(schema.narrative.updatedAt))
  const developing = await developingNarratives(db, recent.slice(0, DEVELOPING_COUNT))

  return {
    editionAt: now.toISOString(),
    stats: { stories: stats?.stories ?? 0, publishers: stats?.publishers ?? 0 },
    lead,
    leadPosition,
    developing,
    narrativeCount: recent.length,
  }
}

/** Published Story ids per Narrative, oldest first. */
async function narrativeStoryIds(db: Db, narrativeIds: string[]) {
  const map = new Map<string, string[]>()
  if (narrativeIds.length === 0) return map
  const rows = await db
    .select({ narrativeId: schema.narrativeStory.narrativeId, storyId: schema.story.id })
    .from(schema.narrativeStory)
    .innerJoin(schema.story, eq(schema.story.id, schema.narrativeStory.storyId))
    .where(
      and(
        inArray(schema.narrativeStory.narrativeId, narrativeIds),
        isNull(schema.narrativeStory.removedAt),
        isNotNull(schema.story.publishedAt),
      ),
    )
    .orderBy(schema.story.firstObservedAt)
  for (const r of rows) map.set(r.narrativeId, [...(map.get(r.narrativeId) ?? []), r.storyId])
  return map
}

async function developingNarratives(
  db: Db,
  narratives: {
    id: string
    slug: string
    title: string
    desk: Desk | null
    updatedAt: Date
  }[],
): Promise<DevelopingNarrative[]> {
  const members = await narrativeStoryIds(
    db,
    narratives.map((n) => n.id),
  )
  const allIds = [...members.values()].flat()
  if (allIds.length === 0) return []
  const [stories, edges] = await Promise.all([
    db
      .select({
        id: schema.story.id,
        slug: schema.story.slug,
        title: schema.story.title,
        firstObservedAt: schema.story.firstObservedAt,
      })
      .from(schema.story)
      .where(inArray(schema.story.id, allIds)),
    db
      .select()
      .from(schema.storyRelationship)
      .where(
        and(
          isNull(schema.storyRelationship.supersededAt),
          inArray(schema.storyRelationship.fromStoryId, allIds),
          inArray(schema.storyRelationship.toStoryId, allIds),
        ),
      ),
  ])
  const byId = new Map(stories.map((s) => [s.id, s]))
  return narratives.map((n) => {
    const ids = members.get(n.id) ?? []
    // Most recent steps, shown oldest first.
    const steps = ids.slice(-MAX_STEPS).flatMap((id) => {
      const story = byId.get(id)
      if (!story) return []
      // The link shown on a step is its strongest link to an earlier Story here.
      const out = edges.filter((e) => e.fromStoryId === id && ids.includes(e.toStoryId))
      const link =
        out.find((e) => e.relation === 'corrects') ??
        out.find((e) => e.relation === 'branches_from') ??
        out[0]
      const target = link ? byId.get(link.toStoryId) : undefined
      const correction = edges.find((e) => e.toStoryId === id && e.relation === 'corrects')
      const corrector = correction ? byId.get(correction.fromStoryId) : undefined
      return [
        {
          storyId: story.id,
          slug: story.slug,
          title: story.title,
          firstObservedAt: story.firstObservedAt.toISOString(),
          relation:
            link && target
              ? {
                  type: link.relation,
                  title: target.title,
                  at: target.firstObservedAt.toISOString(),
                }
              : null,
          correctedAt: corrector ? corrector.firstObservedAt.toISOString() : null,
        },
      ]
    })
    const first = byId.get(ids[0] ?? '')
    return {
      id: n.id,
      slug: n.slug,
      title: n.title,
      desk: n.desk,
      storyCount: ids.length,
      since: (first?.firstObservedAt ?? n.updatedAt).toISOString(),
      updatedAt: n.updatedAt.toISOString(),
      steps,
    }
  })
}
