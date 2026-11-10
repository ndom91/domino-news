import { type Db, schema } from '@dn/db'
import type { Desk, NarrativeDetail, NarrativeListResponse } from '@dn/schemas'
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { cached, SHARED_TTL_MS } from './cache.ts'
import { narrativeDesks, sourceCounts, storyColumns } from './story-list.ts'

const iso = (d: Date) => d.toISOString()

/** `narrativeDesks` for Narratives already loaded, keyed by id. */
export async function deskByNarrative(db: Db, narrativeIds: string[]) {
  if (narrativeIds.length === 0) return new Map<string, Desk | null>()
  const rows = await db.select().from(narrativeDesks(db, narrativeIds))
  return new Map(rows.map((r) => [r.narrativeId, r.desk]))
}

/** Active relationships with both ends in `storyIds`. */
export function edgesWithin(db: Db, storyIds: string[]) {
  return db
    .select()
    .from(schema.storyRelationship)
    .where(
      and(
        isNull(schema.storyRelationship.supersededAt),
        inArray(schema.storyRelationship.fromStoryId, storyIds),
        inArray(schema.storyRelationship.toStoryId, storyIds),
      ),
    )
}

/** A Narrative's own row by id or slug, with its desk. */
export async function findNarrative(db: Db, idOrSlug: string) {
  const match = or(eq(schema.narrative.id, idOrSlug), eq(schema.narrative.slug, idOrSlug))
  const desks = narrativeDesks(
    db,
    db.select({ id: schema.narrative.id }).from(schema.narrative).where(match),
  )
  const [row] = await db
    .select({ narrative: schema.narrative, desk: desks.desk })
    .from(schema.narrative)
    .leftJoin(desks, eq(desks.narrativeId, schema.narrative.id))
    .where(match)
  return row ?? null
}

export async function getNarrative(db: Db, idOrSlug: string): Promise<NarrativeDetail | null> {
  const row = await findNarrative(db, idOrSlug)
  if (!row) return null
  const { narrative, desk } = row
  const stories = await db
    .select({ story: storyColumns, summary: schema.storySummaryVersion.body })
    .from(schema.narrativeStory)
    .innerJoin(schema.story, eq(schema.story.id, schema.narrativeStory.storyId))
    .leftJoin(
      schema.storySummaryVersion,
      eq(schema.storySummaryVersion.id, schema.story.currentSummaryId),
    )
    .where(
      and(
        eq(schema.narrativeStory.narrativeId, narrative.id),
        isNull(schema.narrativeStory.removedAt),
        isNotNull(schema.story.publishedAt),
      ),
    )
    .orderBy(schema.story.firstObservedAt)
  if (stories.length === 0) return null
  const ids = stories.map((s) => s.story.id)
  const [counts, edges] = await Promise.all([sourceCounts(db, ids), edgesWithin(db, ids)])
  return {
    id: narrative.id,
    slug: narrative.slug,
    title: narrative.title,
    desk,
    description: narrative.description,
    createdAt: iso(narrative.createdAt),
    updatedAt: iso(narrative.updatedAt),
    stories: stories.map(({ story, summary }) => ({
      id: story.id,
      slug: story.slug,
      title: story.title,
      summary,
      firstObservedAt: iso(story.firstObservedAt),
      lastUpdatedAt: iso(story.lastUpdatedAt),
      sourceCount: counts.get(story.id) ?? 0,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      fromStoryId: e.fromStoryId,
      toStoryId: e.toStoryId,
      relation: e.relation,
    })),
  }
}

// Smaller Narratives still exist (and show on Story pages) but aren't listed: every Story
// already needs 2+ outlets, so 4 Stories marks a real thread rather than a pair.
export const MIN_NARRATIVE_STORIES = 4

/** The Narratives page, shared by all readers for SHARED_TTL_MS. */
export function listNarratives(db: Db): Promise<NarrativeListResponse> {
  return cached('narratives', SHARED_TTL_MS, () => loadNarratives(db))
}

async function loadNarratives(db: Db): Promise<NarrativeListResponse> {
  const rows = await db
    .select({
      id: schema.narrative.id,
      slug: schema.narrative.slug,
      title: schema.narrative.title,
      description: schema.narrative.description,
      updatedAt: schema.narrative.updatedAt,
      storyCount: sql<number>`count(${schema.story.id})::int`,
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
    .having(sql`count(${schema.story.id}) >= ${MIN_NARRATIVE_STORIES}`)
    .orderBy(desc(schema.narrative.updatedAt))
    // Grouped by period on the page, with older periods collapsed.
    .limit(300)
  const desks = await deskByNarrative(
    db,
    rows.map((r) => r.id),
  )
  return {
    items: rows.map((r) => ({ ...r, desk: desks.get(r.id) ?? null, updatedAt: iso(r.updatedAt) })),
  }
}
