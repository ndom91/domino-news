import { type Db, schema } from '@dn/db'
import type { MutedPublisherList, MutedPublisherRequest } from '@dn/schemas'
import { and, eq } from 'drizzle-orm'
import { DomainError } from './story-service.ts'

export async function listMutedPublishers(db: Db, userId: string): Promise<MutedPublisherList> {
  const rows = await db
    .select({ id: schema.publisher.id, slug: schema.publisher.slug, name: schema.publisher.name })
    .from(schema.userPublisherMute)
    .innerJoin(schema.publisher, eq(schema.userPublisherMute.publisherId, schema.publisher.id))
    .where(eq(schema.userPublisherMute.userId, userId))
    .orderBy(schema.publisher.name)
  return { items: rows }
}

/** Mutes only the publisher's contribution to this reader's personalised surfaces. */
export async function setMutedPublisher(
  db: Db,
  userId: string,
  req: MutedPublisherRequest,
): Promise<MutedPublisherList> {
  const key = and(
    eq(schema.userPublisherMute.userId, userId),
    eq(schema.userPublisherMute.publisherId, req.publisherId),
  )
  if (!req.muted) {
    await db.delete(schema.userPublisherMute).where(key)
    return listMutedPublishers(db, userId)
  }
  const [publisher] = await db
    .select({ id: schema.publisher.id })
    .from(schema.publisher)
    .where(eq(schema.publisher.id, req.publisherId))
  if (!publisher) throw new DomainError('not_found', `publisher ${req.publisherId} not found`)
  await db
    .insert(schema.userPublisherMute)
    .values({ userId, publisherId: req.publisherId })
    .onConflictDoNothing()
  return listMutedPublishers(db, userId)
}

export async function mutedPublisherIds(db: Db, userId: string): Promise<ReadonlySet<string>> {
  const rows = await db
    .select({ publisherId: schema.userPublisherMute.publisherId })
    .from(schema.userPublisherMute)
    .where(eq(schema.userPublisherMute.userId, userId))
  return new Set(rows.map((row) => row.publisherId))
}
