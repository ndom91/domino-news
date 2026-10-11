import { type Db, schema } from '@dn/db'
import type { FollowList, FollowRequest } from '@dn/schemas'
import { and, eq, inArray } from 'drizzle-orm'
import { DomainError } from './story-service.ts'

/** Followed narratives and publishers, with display names. */
export async function listFollows(db: Db, userId: string): Promise<FollowList> {
  const rows = await db.select().from(schema.userFollow).where(eq(schema.userFollow.userId, userId))
  const ids = (type: 'narrative' | 'publisher') =>
    rows.filter((r) => r.targetType === type).map((r) => r.targetId)
  const narrativeIds = ids('narrative')
  const publisherIds = ids('publisher')
  const narratives = narrativeIds.length
    ? await db
        .select({
          id: schema.narrative.id,
          slug: schema.narrative.slug,
          title: schema.narrative.title,
        })
        .from(schema.narrative)
        .where(inArray(schema.narrative.id, narrativeIds))
    : []
  const publishers = publisherIds.length
    ? await db
        .select({
          id: schema.publisher.id,
          slug: schema.publisher.slug,
          title: schema.publisher.name,
        })
        .from(schema.publisher)
        .where(inArray(schema.publisher.id, publisherIds))
    : []
  return {
    items: [
      ...narratives.map((n) => ({ targetType: 'narrative' as const, ...n })),
      ...publishers.map((p) => ({ targetType: 'publisher' as const, ...p })),
    ],
  }
}

/** Follow or unfollow. Unknown targets are rejected so the list never holds dead ids. */
export async function setFollow(db: Db, userId: string, req: FollowRequest): Promise<FollowList> {
  const key = and(
    eq(schema.userFollow.userId, userId),
    eq(schema.userFollow.targetType, req.targetType),
    eq(schema.userFollow.targetId, req.targetId),
  )
  if (!req.follow) {
    await db.delete(schema.userFollow).where(key)
    return listFollows(db, userId)
  }
  const table = req.targetType === 'narrative' ? schema.narrative : schema.publisher
  const [exists] = await db.select({ id: table.id }).from(table).where(eq(table.id, req.targetId))
  if (!exists) throw new DomainError('not_found', `${req.targetType} ${req.targetId} not found`)
  await db
    .insert(schema.userFollow)
    .values({ userId, targetType: req.targetType, targetId: req.targetId })
    .onConflictDoNothing()
  return listFollows(db, userId)
}
