import { type Db, schema } from '@dn/db'
import { and, eq } from 'drizzle-orm'

export async function savePushSubscription(db: Db, userId: string, token: string) {
  await db
    .insert(schema.pushSubscription)
    .values({ token, userId })
    .onConflictDoUpdate({
      target: schema.pushSubscription.token,
      set: { userId, updatedAt: new Date() },
    })
}

export async function removePushSubscription(db: Db, userId: string, token: string) {
  await db
    .delete(schema.pushSubscription)
    .where(
      and(eq(schema.pushSubscription.userId, userId), eq(schema.pushSubscription.token, token)),
    )
}
