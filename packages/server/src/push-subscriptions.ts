import { type Db, schema } from '@dn/db'
import { and, eq, sql } from 'drizzle-orm'

export async function savePushSubscription(db: Db, userId: string, token: string) {
  await db
    .insert(schema.pushSubscription)
    .values({ token, userId })
    .onConflictDoUpdate({
      target: schema.pushSubscription.token,
      set: {
        userId,
        updatedAt: new Date(),
        generation: sql`case when ${schema.pushSubscription.userId} = ${userId} then ${schema.pushSubscription.generation} else ${schema.pushSubscription.generation} + 1 end`,
        lastNotifiedAt: sql`case when ${schema.pushSubscription.userId} = ${userId} then ${schema.pushSubscription.lastNotifiedAt} else null end`,
      },
      // Do not transfer a token while its current owner has a request in flight.
      // The app retries registration, while the sender can finish without exposing its alert.
      where: sql`not exists (
        select 1 from push_delivery delivery
        where delivery.token = ${schema.pushSubscription.token}
          and delivery.subscription_generation = ${schema.pushSubscription.generation}
          and delivery.status = 'sending'
      )`,
    })
}

export async function pushSubscriptionRegistered(db: Db, userId: string, token: string) {
  const subscription = await db.query.pushSubscription.findFirst({
    columns: { token: true },
    where: and(
      eq(schema.pushSubscription.token, token),
      eq(schema.pushSubscription.userId, userId),
    ),
  })

  return Boolean(subscription)
}

export async function removePushSubscription(db: Db, userId: string, token: string) {
  await db
    .delete(schema.pushSubscription)
    .where(
      and(eq(schema.pushSubscription.userId, userId), eq(schema.pushSubscription.token, token)),
    )
}
