import { type Db, schema } from '@dn/db'
import { pickLead } from '@dn/domain'
import type { Desk, DevelopingNarrative, Edition, FrontPage, Region } from '@dn/schemas'
import { and, arrayContains, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { cached, SHARED_TTL_MS } from './cache.ts'
import { deskByNarrative, edgesWithin, getStoryLead, MIN_NARRATIVE_STORIES } from './reader.ts'

const DAY_MS = 86_400_000
const DEVELOPING_COUNT = 3
const MAX_STEPS = 6
const LEAD_CANDIDATES = 30

/**
 * Everything on the front page above the Latest grid. The lead is the most widely reported
 * recent Story (in one of the reader's regions when they picked some); Latest is the regular story list.
 */
export async function getFrontPage(
  db: Db,
  opts: { region?: Region; regions?: readonly Region[]; now?: Date } = {},
): Promise<FrontPage> {
  const now = opts.now ?? new Date()

  const [edition, { lead, leadPosition }, { developing, narrativeCount }] = await Promise.all([
    getEdition(db, now),
    cached(leadKey(opts), SHARED_TTL_MS, () => leadStory(db, opts, now)),
    cached('developing', SHARED_TTL_MS, () => developingSection(db)),
  ])

  return {
    ...edition,
    lead,
    leadPosition,
    developing,
    narrativeCount,
  }
}

/** The header strip: edition time and the last 24 hours' Story and publisher counts. */
export async function getEdition(db: Db, now = new Date()): Promise<Edition> {
  const stats = await cached('edition-stats', SHARED_TTL_MS, () => editionStats(db, now))
  return { editionAt: now.toISOString(), stats }
}

async function editionStats(db: Db, now: Date) {
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
  return { stories: stats?.stories ?? 0, publishers: stats?.publishers ?? 0 }
}

/**
 * The lead depends only on the region filter, or without one on the reader's regions as a
 * set, so readers with the same picks share it. Regions are a fixed enum: the keys are bounded.
 */
function leadKey(opts: { region?: Region; regions?: readonly Region[] }) {
  if (opts.region) return `front-lead:${opts.region}`
  return `front-lead:picks:${[...new Set(opts.regions)].sort().join(',')}`
}

async function leadStory(
  db: Db,
  opts: { region?: Region; regions?: readonly Region[] },
  now: Date,
) {
  // The first page of Latest (same filter and order), with only what pickLead needs.
  const candidates = await db
    .select({
      id: schema.story.id,
      lastUpdatedAt: schema.story.lastUpdatedAt,
      regions: schema.story.regions,
      sourceCount: sql<number>`(select count(*)::int from story_article sa
        where sa.story_id = story.id and sa.removed_at is null)`,
    })
    .from(schema.story)
    .where(
      and(
        isNotNull(schema.story.publishedAt),
        isNull(schema.story.mergedIntoStoryId),
        opts.region ? arrayContains(schema.story.regions, [opts.region]) : undefined,
      ),
    )
    .orderBy(desc(schema.story.lastUpdatedAt), desc(schema.story.id))
    .limit(LEAD_CANDIDATES)
  const leadItem = pickLead(
    candidates.map((c) => ({ ...c, lastUpdatedAt: c.lastUpdatedAt.toISOString() })),
    opts.region ? [] : (opts.regions ?? []),
    now.getTime(),
  )
  const lead = leadItem ? await getStoryLead(db, leadItem.id) : null
  const leadNarrative = lead?.narratives[0]
  let leadPosition: FrontPage['leadPosition'] = null
  if (lead && leadNarrative) {
    const members = await narrativeStoryIds(db, [leadNarrative.id])
    const ids = members.get(leadNarrative.id) ?? []
    leadPosition = { index: ids.indexOf(lead.id) + 1, total: ids.length }
  }
  return { lead, leadPosition }
}

async function developingSection(db: Db) {
  const rows = await db
    .select({
      id: schema.narrative.id,
      slug: schema.narrative.slug,
      title: schema.narrative.title,
      updatedAt: schema.narrative.updatedAt,
      // Narratives that qualify, before the limit (for "View more narratives").
      total: sql<number>`count(*) over ()`.mapWith(Number).as('total'),
    })
    .from(schema.narrative)
    .innerJoin(
      schema.narrativeStory,
      and(
        eq(schema.narrativeStory.narrativeId, schema.narrative.id),
        isNull(schema.narrativeStory.removedAt),
      ),
    )
    .innerJoin(
      schema.story,
      and(eq(schema.story.id, schema.narrativeStory.storyId), isNotNull(schema.story.publishedAt)),
    )
    .groupBy(schema.narrative.id)
    .having(sql`count(*) >= ${MIN_NARRATIVE_STORIES}`)
    .orderBy(desc(schema.narrative.updatedAt))
    .limit(DEVELOPING_COUNT)
  const desks = await deskByNarrative(
    db,
    rows.map((r) => r.id),
  )
  const recent = rows.map((r) => ({ ...r, desk: desks.get(r.id) ?? null }))
  const developing = await developingNarratives(db, recent)
  return { developing, narrativeCount: recent[0]?.total ?? 0 }
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
    edgesWithin(db, allIds),
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
