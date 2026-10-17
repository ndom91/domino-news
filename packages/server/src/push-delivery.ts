import { type Db, schema } from '@dn/db'
import { ID_PREFIX, newId } from '@dn/domain'
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'

const DELIVERY_BATCH_SIZE = 100

export type PushSubscriptionSnapshot = { token: string; generation: number }

export type PushRecipient = {
  userId: string
  subscriptions: PushSubscriptionSnapshot[]
  since: Date
}

export type PushDeliveryIntent = {
  id: string
  token: string
  subscriptionGeneration: number
  storyId: string
}

export async function pushRecipientsReadyForAlert(db: Db): Promise<PushRecipient[]> {
  const { rows } = await db.execute<{
    userId: string
    token: string
    generation: number
    since: Date
  }>(sql`
    with eligible_readers as (
      select user_id, coalesce(max(last_notified_at), min(created_at)) as since
      from push_subscription
      group by user_id
      having coalesce(max(last_notified_at), min(created_at)) <= now() - interval '4 hours'
      -- Change ordering every delivery run so non-matching readers cannot starve later readers.
      order by md5(user_id || floor(extract(epoch from now()) / 300)::text)
      limit ${DELIVERY_BATCH_SIZE}
    )
    select subscription.user_id as "userId", subscription.token, subscription.generation,
      eligible_readers.since
    from push_subscription subscription
    join eligible_readers on eligible_readers.user_id = subscription.user_id
    order by subscription.user_id, subscription.created_at
  `)
  const recipients = new Map<string, PushRecipient>()
  for (const row of rows) {
    const recipient = recipients.get(row.userId)
    if (recipient) {
      recipient.subscriptions.push({ token: row.token, generation: row.generation })
    } else {
      recipients.set(row.userId, {
        userId: row.userId,
        subscriptions: [{ token: row.token, generation: row.generation }],
        since: row.since,
      })
    }
  }
  return [...recipients.values()]
}

export async function newlyPublishedStoryIds(db: Db, since: Date): Promise<Set<string>> {
  const rows = await db
    .select({ id: schema.story.id })
    .from(schema.story)
    .where(
      and(
        sql`${schema.story.publishedAt} > ${since}`,
        sql`${schema.story.publishedAt} <= now()`,
        sql`${schema.story.mergedIntoStoryId} is null`,
      ),
    )
  return new Set(rows.map((row) => row.id))
}

/** Records an alert before delivery. Unique subscription/story rows make a retry safe. */
export async function createPushDeliveryIntents(
  db: Db,
  userId: string,
  storyId: string,
  subscriptions: PushSubscriptionSnapshot[],
  at = new Date(),
): Promise<PushDeliveryIntent[]> {
  if (subscriptions.length === 0) return []
  const intents = subscriptions.map((subscription) => ({
    id: newId(ID_PREFIX.pushDelivery),
    userId,
    token: subscription.token,
    subscriptionGeneration: subscription.generation,
    storyId,
  }))
  const created = await db
    .insert(schema.pushDelivery)
    .values(intents)
    .onConflictDoNothing()
    .returning({
      id: schema.pushDelivery.id,
      token: schema.pushDelivery.token,
      subscriptionGeneration: schema.pushDelivery.subscriptionGeneration,
      storyId: schema.pushDelivery.storyId,
    })
  if (created.length) await markPushSubscriptionsNotified(db, userId, subscriptions, at)
  return created
}

async function markPushSubscriptionsNotified(
  db: Db,
  userId: string,
  subscriptions: PushSubscriptionSnapshot[],
  at: Date,
) {
  for (const subscription of subscriptions) {
    await db
      .update(schema.pushSubscription)
      .set({ lastNotifiedAt: at, updatedAt: at })
      .where(
        and(
          eq(schema.pushSubscription.userId, userId),
          eq(schema.pushSubscription.token, subscription.token),
          eq(schema.pushSubscription.generation, subscription.generation),
        ),
      )
  }
}

/** Atomically makes planned work sendable; `sending` is never automatically resent. */
export async function claimPushDeliveryIntents(db: Db, ids: string[]) {
  if (ids.length === 0) return []
  return db
    .update(schema.pushDelivery)
    .set({ status: 'sending', sentAt: new Date() })
    .where(
      and(
        inArray(schema.pushDelivery.id, ids),
        eq(schema.pushDelivery.status, 'planned'),
        sql`exists (
          select 1 from push_subscription subscription
          where subscription.token = ${schema.pushDelivery.token}
            and subscription.user_id = ${schema.pushDelivery.userId}
            and subscription.generation = ${schema.pushDelivery.subscriptionGeneration}
        )`,
      ),
    )
    .returning({
      id: schema.pushDelivery.id,
      token: schema.pushDelivery.token,
      subscriptionGeneration: schema.pushDelivery.subscriptionGeneration,
      storyId: schema.pushDelivery.storyId,
    })
}

export async function recordPushSendResults(
  db: Db,
  accepted: { id: string; ticketId: string }[],
  failed: { id: string; error: string }[],
) {
  for (const ticket of accepted) {
    await db
      .update(schema.pushDelivery)
      .set({ expoTicketId: ticket.ticketId, status: 'accepted' })
      .where(and(eq(schema.pushDelivery.id, ticket.id), eq(schema.pushDelivery.status, 'sending')))
  }
  for (const result of failed) {
    await db
      .update(schema.pushDelivery)
      .set({ error: result.error, status: 'failed' })
      .where(and(eq(schema.pushDelivery.id, result.id), eq(schema.pushDelivery.status, 'sending')))
  }
}

/** A provider response may have been accepted even if its body could not be read: never resend it. */
export async function markPushDeliveriesUnknown(db: Db, ids: string[], error: string) {
  if (ids.length === 0) return
  await db
    .update(schema.pushDelivery)
    .set({ error, status: 'unknown' })
    .where(and(inArray(schema.pushDelivery.id, ids), eq(schema.pushDelivery.status, 'sending')))
}

export async function pushTicketsAwaitingReceipt(db: Db) {
  return db
    .select({
      id: schema.pushDelivery.id,
      ticketId: schema.pushDelivery.expoTicketId,
      token: schema.pushDelivery.token,
      userId: schema.pushDelivery.userId,
      subscriptionGeneration: schema.pushDelivery.subscriptionGeneration,
    })
    .from(schema.pushDelivery)
    .where(
      and(
        eq(schema.pushDelivery.status, 'accepted'),
        isNotNull(schema.pushDelivery.expoTicketId),
        sql`${schema.pushDelivery.sentAt} <= now() - interval '15 minutes'`,
        sql`(${schema.pushDelivery.receiptCheckedAt} is null or ${schema.pushDelivery.receiptCheckedAt} <= now() - interval '5 minutes')`,
      ),
    )
    .limit(1000)
}

export async function recordPushReceipts(
  db: Db,
  deliveredIds: string[],
  failed: { id: string; error: string }[],
  checkedIds: string[],
  at = new Date(),
) {
  if (deliveredIds.length)
    await db
      .update(schema.pushDelivery)
      .set({ deliveredAt: at, receiptCheckedAt: at, status: 'delivered' })
      .where(
        and(
          inArray(schema.pushDelivery.id, deliveredIds),
          eq(schema.pushDelivery.status, 'accepted'),
        ),
      )
  for (const receipt of failed) {
    await db
      .update(schema.pushDelivery)
      .set({ error: receipt.error, receiptCheckedAt: at, status: 'failed' })
      .where(
        and(eq(schema.pushDelivery.id, receipt.id), eq(schema.pushDelivery.status, 'accepted')),
      )
  }
  const complete = new Set([...deliveredIds, ...failed.map((receipt) => receipt.id)])
  const pending = checkedIds.filter((id) => !complete.has(id))
  if (pending.length)
    await db
      .update(schema.pushDelivery)
      .set({ receiptCheckedAt: at })
      .where(
        and(inArray(schema.pushDelivery.id, pending), eq(schema.pushDelivery.status, 'accepted')),
      )
}

/** Removes a token only when it still belongs to the delivery's original account and generation. */
export async function removeInvalidPushSubscription(
  db: Db,
  subscription: { userId: string; token: string; generation: number },
) {
  await db
    .delete(schema.pushSubscription)
    .where(
      and(
        eq(schema.pushSubscription.userId, subscription.userId),
        eq(schema.pushSubscription.token, subscription.token),
        eq(schema.pushSubscription.generation, subscription.generation),
      ),
    )
}

export async function prunePushDeliveries(db: Db) {
  await db
    .delete(schema.pushDelivery)
    .where(sql`${schema.pushDelivery.createdAt} < now() - interval '30 days'`)
}
