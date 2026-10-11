import { type Db, schema } from '@dn/db'
import type { UserPreferences, UserPreferencesUpdate } from '@dn/schemas'
import { eq, sql } from 'drizzle-orm'

// Reading history is short-lived: insights only look back this far.
export const READ_RETENTION_DAYS = 30

export async function getPreferences(db: Db, userId: string): Promise<UserPreferences> {
  const [row] = await db
    .select({
      regions: schema.userPreference.regions,
      desks: schema.userPreference.desks,
      rememberReads: schema.userPreference.rememberReads,
    })
    .from(schema.userPreference)
    .where(eq(schema.userPreference.userId, userId))
  return {
    regions: row?.regions ?? [],
    desks: row?.desks ?? [],
    rememberReads: row?.rememberReads ?? false,
  }
}

/** Saves only the fields given. Turning reading history off deletes it. */
export async function savePreferences(
  db: Db,
  userId: string,
  update: UserPreferencesUpdate,
): Promise<UserPreferences> {
  const current = await getPreferences(db, userId)
  const next = { ...current, ...update }
  await db
    .insert(schema.userPreference)
    .values({ userId, ...next })
    .onConflictDoUpdate({
      target: schema.userPreference.userId,
      set: { ...next, updatedAt: new Date() },
    })
  if (!next.rememberReads) {
    await db.delete(schema.readingEvent).where(eq(schema.readingEvent.userId, userId))
  }
  return next
}

/** Record that a user opened a Story, only if they opted in. Returns whether it was kept. */
export async function recordRead(db: Db, userId: string, storyId: string): Promise<boolean> {
  const { rememberReads } = await getPreferences(db, userId)
  if (!rememberReads) return false
  const [story] = await db
    .select({ id: schema.story.id })
    .from(schema.story)
    .where(eq(schema.story.id, storyId))
  if (!story) return false
  await db
    .insert(schema.readingEvent)
    .values({ userId, storyId })
    .onConflictDoUpdate({
      target: [schema.readingEvent.userId, schema.readingEvent.storyId],
      set: { readAt: new Date() },
    })
  return true
}

export async function pruneReadingEvents(db: Db, days = READ_RETENTION_DAYS) {
  const deleted = await db
    .delete(schema.readingEvent)
    .where(sql`${schema.readingEvent.readAt} < now() - make_interval(days => ${days})`)
    .returning({ userId: schema.readingEvent.userId })
  return { readingEvents: deleted.length }
}
