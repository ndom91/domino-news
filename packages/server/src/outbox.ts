import { type Db, schema } from '@dn/db'
import { asc, eq, isNotNull, sql } from 'drizzle-orm'

export type AggregateType = 'story' | 'narrative' | 'article'

/**
 * Delete delivered outbox events and their inbox records after `days`. Pending and
 * dead-lettered events are kept so they stay visible and replayable.
 */
export async function pruneDeliveredEvents(db: Db, days: number) {
  const cutoff = sql`now() - make_interval(days => ${days})`
  const outbox = await db
    .delete(schema.outboxEvent)
    .where(sql`${schema.outboxEvent.processedAt} < ${cutoff}`)
    .returning({ id: schema.outboxEvent.id })
  const inbox = await db
    .delete(schema.inboxEvent)
    .where(sql`${schema.inboxEvent.processedAt} < ${cutoff}`)
    .returning({ eventId: schema.inboxEvent.eventId })
  return { outbox: outbox.length, inbox: inbox.length }
}

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

/**
 * Bump a Story's aggregate version and emit an outbox event, in the caller's transaction.
 * Pass `at: null` for bookkeeping changes (graph links, embeddings) that must not move the
 * Story's "last updated" time, which drives feed order.
 */
export async function touchStory(
  db: Db,
  storyId: string,
  eventType: string,
  at: Date | null = new Date(),
) {
  const [row] = await db
    .update(schema.story)
    .set({ version: sql`${schema.story.version} + 1`, ...(at ? { lastUpdatedAt: at } : {}) })
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

export const NARRATIVE_COLOR_SLOTS = 6

/**
 * Give a Narrative a colour slot if it has none: the lowest free slot 1–6, or, when all
 * are taken, the slot of the least recently updated Narrative (which then shows slot 0).
 * Never derived from the title, so colours don't collide or shift. Call inside the
 * transaction that creates or updates the Narrative.
 */
export async function claimColorSlot(db: Db, narrativeId: string) {
  const holders = await db
    .select({
      id: schema.narrative.id,
      slot: schema.narrative.colorSlot,
      updatedAt: schema.narrative.updatedAt,
    })
    .from(schema.narrative)
    .where(isNotNull(schema.narrative.colorSlot))
    .orderBy(asc(schema.narrative.updatedAt))
    .for('update')
  const own = holders.find((h) => h.id === narrativeId)
  if (own?.slot) return own.slot
  const used = new Set(holders.map((h) => h.slot))
  let slot = [1, 2, 3, 4, 5, 6].find((s) => !used.has(s))
  if (!slot) {
    const oldest = holders[0]
    if (!oldest?.slot) return null
    slot = oldest.slot
    await db
      .update(schema.narrative)
      .set({ colorSlot: null })
      .where(eq(schema.narrative.id, oldest.id))
  }
  await db
    .update(schema.narrative)
    .set({ colorSlot: slot })
    .where(eq(schema.narrative.id, narrativeId))
  return slot
}
