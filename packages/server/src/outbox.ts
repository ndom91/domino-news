import { type Db, schema } from '@dn/db'
import { eq, sql } from 'drizzle-orm'

export type AggregateType = 'story' | 'narrative' | 'article'

/** Insert an outbox event. Must be called inside the same transaction as the canonical write. */
export async function writeOutbox(
  db: Db,
  event: { aggregateType: AggregateType; aggregateId: string; eventType: string; version: number },
) {
  await db.insert(schema.outboxEvent).values({
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    eventType: event.eventType,
    aggregateVersion: event.version,
  })
}

/** Bump a Story's aggregate version and emit an outbox event, in the caller's transaction. */
export async function touchStory(db: Db, storyId: string, eventType: string, at = new Date()) {
  const [row] = await db
    .update(schema.story)
    .set({ version: sql`${schema.story.version} + 1`, lastUpdatedAt: at })
    .where(eq(schema.story.id, storyId))
    .returning({ version: schema.story.version })
  if (!row) throw new Error(`story ${storyId} not found`)
  await writeOutbox(db, {
    aggregateType: 'story',
    aggregateId: storyId,
    eventType,
    version: row.version,
  })
  return row.version
}

export async function touchNarrative(
  db: Db,
  narrativeId: string,
  eventType: string,
  at = new Date(),
) {
  const [row] = await db
    .update(schema.narrative)
    .set({ version: sql`${schema.narrative.version} + 1`, updatedAt: at })
    .where(eq(schema.narrative.id, narrativeId))
    .returning({ version: schema.narrative.version })
  if (!row) throw new Error(`narrative ${narrativeId} not found`)
  await writeOutbox(db, {
    aggregateType: 'narrative',
    aggregateId: narrativeId,
    eventType,
    version: row.version,
  })
  return row.version
}
