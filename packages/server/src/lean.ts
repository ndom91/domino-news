import { type Db, schema } from '@dn/db'
import { oneSidedCoverage } from '@dn/domain'
import type { PublisherRef, StoryLean } from '@dn/schemas'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { latestLeans } from './assessments.ts'

/**
 * Each Story's covering newsroom publishers, grouped by the country their lean is relative
 * to. Official sources have no lean, and publishers with no country can't be placed, so
 * both are left out. Countries with the most rated publishers come first.
 */
export async function leanMixByStory(
  db: Db,
  storyIds: string[],
): Promise<Map<string, StoryLean[]>> {
  if (storyIds.length === 0) return new Map()
  const rows = await db
    .selectDistinct({
      storyId: schema.storyArticle.storyId,
      publisher: {
        id: schema.publisher.id,
        slug: schema.publisher.slug,
        name: schema.publisher.name,
        domain: schema.publisher.domain,
      },
    })
    .from(schema.storyArticle)
    .innerJoin(schema.article, eq(schema.article.id, schema.storyArticle.articleId))
    .innerJoin(schema.publisher, eq(schema.publisher.id, schema.article.publisherId))
    .where(
      and(
        inArray(schema.storyArticle.storyId, storyIds),
        isNull(schema.storyArticle.removedAt),
        eq(schema.publisher.kind, 'newsroom'),
      ),
    )
  const leans = await latestLeans(db, [...new Set(rows.map((r) => r.publisher.id))])

  const byStory = new Map<string, Map<string, StoryLean['publishers']>>()
  for (const r of rows) {
    const info = leans.get(r.publisher.id)
    if (!info?.country) continue
    const countries = byStory.get(r.storyId) ?? new Map<string, StoryLean['publishers']>()
    byStory.set(r.storyId, countries)
    const list = countries.get(info.country) ?? []
    countries.set(info.country, list)
    list.push({
      publisher: r.publisher as PublisherRef,
      lean: info.lean,
      estimated: info.basis === 'estimated',
    })
  }

  const result = new Map<string, StoryLean[]>()
  for (const [storyId, countries] of byStory) {
    const mixes = [...countries].map(([country, publishers]) => ({
      country,
      publishers: publishers.sort((a, b) => a.publisher.name.localeCompare(b.publisher.name)),
      // An estimate can show in the bar, but can't make a Story one-sided.
      oneSided: oneSidedCoverage(publishers.filter((p) => !p.estimated).map((p) => p.lean)),
    }))
    const rated = (m: StoryLean) => m.publishers.filter((p) => p.lean).length
    mixes.sort(
      (a, b) =>
        rated(b) - rated(a) ||
        b.publishers.length - a.publishers.length ||
        a.country.localeCompare(b.country),
    )
    result.set(storyId, mixes)
  }
  return result
}
