import { type Db, schema } from '@dn/db'
import type { UserPreferences } from '@dn/schemas'
import { eq } from 'drizzle-orm'

export async function getPreferences(db: Db, userId: string): Promise<UserPreferences> {
  const [row] = await db
    .select({ edition: schema.userPreference.edition })
    .from(schema.userPreference)
    .where(eq(schema.userPreference.userId, userId))
  return { edition: row?.edition ?? null }
}

export async function savePreferences(
  db: Db,
  userId: string,
  prefs: UserPreferences,
): Promise<UserPreferences> {
  await db
    .insert(schema.userPreference)
    .values({ userId, edition: prefs.edition })
    .onConflictDoUpdate({
      target: schema.userPreference.userId,
      set: { edition: prefs.edition, updatedAt: new Date() },
    })
  return getPreferences(db, userId)
}
