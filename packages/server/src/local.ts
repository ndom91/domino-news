import type { Db } from '@dn/db'
import type { LocalFeedResponse, LocalScope, Place } from '@dn/schemas'
import { sql } from 'drizzle-orm'
import { storyListItems } from './reader.ts'

const SCOPE_BY_RANK: Record<number, LocalScope> = { 3: 'city', 2: 'county', 1: 'country' }

type RankedRow = { id: string; last_updated_at: Date | string; scope: number }

/** Tiered Local feed: exact city, then county/local area, then the rest of the country. */
export async function getLocalFeed(
  db: Db,
  locality: Place | null,
  source: LocalFeedResponse['source'],
  opts: { cursor?: string; limit?: number } = {},
): Promise<LocalFeedResponse> {
  if (!locality) return { locality: null, source: null, items: [], pageInfo: { nextCursor: null } }

  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100)
  const city = locality.city?.trim().toLocaleLowerCase('en') ?? null
  const county = locality.county?.trim().toLocaleLowerCase('en') ?? null
  const [cursorScopeText, cursorAt, cursorId] = opts.cursor?.split('|') ?? []
  const cursorScope = cursorScopeText ? Number(cursorScopeText) : null
  const cursorDate = cursorAt ? new Date(cursorAt) : null
  const hasCursor =
    cursorScope !== null &&
    SCOPE_BY_RANK[cursorScope] !== undefined &&
    cursorDate !== null &&
    !Number.isNaN(cursorDate.valueOf()) &&
    Boolean(cursorId)

  const { rows } = await db.execute<RankedRow>(sql`
    with ranked as (
      select s.id, s.last_updated_at,
        case
          when ${city}::text is not null and exists (
            select 1 from jsonb_array_elements(s.locations) location
            where location->>'country' = ${locality.country}
              and lower(btrim(location->>'city')) = ${city}
          ) then 3
          when ${county}::text is not null and exists (
            select 1 from jsonb_array_elements(s.locations) location
            where location->>'country' = ${locality.country}
              and lower(btrim(location->>'county')) = ${county}
          ) then 2
          when exists (
            select 1 from jsonb_array_elements(s.locations) location
            where location->>'country' = ${locality.country}
          ) then 1
          else 0
        end::int as scope
      from story s
      where s.published_at is not null and s.merged_into_story_id is null
        and s.locations @> ${JSON.stringify([{ country: locality.country }])}::jsonb
    )
    select id, last_updated_at, scope from ranked
    where scope > 0
      and (
        ${hasCursor}::boolean = false
        or scope < ${cursorScope}
        or (scope = ${cursorScope} and last_updated_at < ${cursorDate})
        or (scope = ${cursorScope} and last_updated_at = ${cursorDate} and id < ${cursorId ?? ''})
      )
    order by scope desc, last_updated_at desc, id desc
    limit ${limit + 1}
  `)

  const page = rows.slice(0, limit)
  const stories = await storyListItems(
    db,
    page.map((row) => row.id),
  )
  const scopeById = new Map(page.map((row) => [row.id, SCOPE_BY_RANK[row.scope] ?? 'country']))
  const last = page.at(-1)
  const lastAt = last ? new Date(last.last_updated_at).toISOString() : null
  return {
    locality,
    source,
    items: stories.map((story) => ({ story, scope: scopeById.get(story.id) ?? 'country' })),
    pageInfo: {
      nextCursor:
        rows.length > limit && last && lastAt ? `${last.scope}|${lastAt}|${last.id}` : null,
    },
  }
}
