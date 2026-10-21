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
      topics: schema.userPreference.topics,
      rememberReads: schema.userPreference.rememberReads,
      country: schema.userPreference.country,
      briefingLastOpenedAt: schema.userPreference.briefingLastOpenedAt,
      onboardedAt: schema.userPreference.onboardedAt,
    })
    .from(schema.userPreference)
    .where(eq(schema.userPreference.userId, userId))
  return {
    regions: row?.regions ?? [],
    desks: row?.desks ?? [],
    topics: row?.topics ?? [],
    rememberReads: row?.rememberReads ?? false,
    country: row?.country ?? null,
    onboarded: Boolean(row?.onboardedAt),
  }
}

/**
 * Advances the sole Briefing activity checkpoint and returns its prior value. This deliberately
 * stores neither individual reading activity nor a visit history.
 */
export async function openBriefing(
  db: Db,
  userId: string,
): Promise<{ since: Date | null; openedAt: Date }> {
  const openedAt = new Date()
  const { rows } = await db.execute<{ briefing_last_opened_at: string | Date | null }>(sql`
    with previous as (
      select briefing_last_opened_at from user_preference where user_id = ${userId}
    ), saved as (
      insert into user_preference (user_id, briefing_last_opened_at, updated_at)
      values (${userId}, ${openedAt}, ${openedAt})
      on conflict (user_id) do update set briefing_last_opened_at = excluded.briefing_last_opened_at,
        updated_at = excluded.updated_at
    )
    select briefing_last_opened_at from previous
  `)
  const previous = rows[0]?.briefing_last_opened_at
  return { since: previous ? new Date(previous) : null, openedAt }
}

/** Saves only the fields given. Turning reading history off deletes it. */
export async function savePreferences(
  db: Db,
  userId: string,
  update: UserPreferencesUpdate,
): Promise<UserPreferences> {
  const current = await getPreferences(db, userId)
  const next = { ...current, ...update, onboarded: current.onboarded || update.onboarded === true }
  const { onboarded, ...columns } = next
  // Onboarding is only ever marked done; finishing it again keeps the first timestamp.
  const onboardedAt = onboarded && !current.onboarded ? { onboardedAt: new Date() } : {}
  await db
    .insert(schema.userPreference)
    .values({ userId, ...columns, ...onboardedAt })
    .onConflictDoUpdate({
      target: schema.userPreference.userId,
      set: { ...columns, ...onboardedAt, updatedAt: new Date() },
    })
  if (update.rememberReads === false) {
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

export async function pruneReaderHistory(db: Db, days = READ_RETENTION_DAYS) {
  const reads = await db
    .delete(schema.readingEvent)
    .where(sql`${schema.readingEvent.readAt} < now() - make_interval(days => ${days})`)
  // Taps on Stories long out of the For You window only matter for the weights they left.
  const taps = await db
    .delete(schema.userStoryFeedback)
    .where(sql`${schema.userStoryFeedback.createdAt} < now() - make_interval(days => ${days})`)
  return { readingEvents: reads.rowCount ?? 0, storyFeedback: taps.rowCount ?? 0 }
}
