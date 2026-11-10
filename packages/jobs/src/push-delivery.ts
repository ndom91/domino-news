import { withTransaction } from '@dn/db'
import { stripCitations } from '@dn/domain'
import {
  claimPushDeliveryIntents,
  createPushDeliveryIntents,
  markPushDeliveriesUnknown,
  newlyPublishedStoryIds,
  pushRecipientsReadyForAlert,
  pushTicketsAwaitingReceipt,
  rankForYou,
  reconcileStalePushDeliveries,
  recordPushReceipts,
  recordPushSendResults,
  removeInvalidPushSubscription,
  storyListItems,
} from '@dn/server'
import type { WorkerContext } from './context.ts'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'
const EXPO_BATCH_SIZE = 100
// Alert only for a new Story that ranks this high in the reader's For You.
const ALERT_RANK_LIMIT = 100

type ExpoMessage = {
  to: string
  title: string
  body: string
  sound: 'default'
  channelId: 'for-you'
  data: { storySlug: string }
}

type ExpoResult = { status: 'ok'; id: string } | { status: 'error'; error: string }

type PushStory = { slug: string; summary: string | null; title: string }

export function forYouExpoMessage(token: string, story: PushStory): ExpoMessage {
  return {
    to: token,
    title: 'For You',
    body: stripCitations(story.summary ?? story.title),
    sound: 'default',
    channelId: 'for-you',
    data: { storySlug: story.slug },
  }
}

export async function deliverForYouPushes(ctx: WorkerContext) {
  const reconciled = await reconcileStalePushDeliveries(ctx.db)
  const receipts = await collectExpoReceipts(ctx)
  const recipients = await pushRecipientsReadyForAlert(ctx.db)
  let alerted = 0
  let invalidTokens = receipts.invalidTokens
  let failed = receipts.failed

  for (const recipient of recipients) {
    const newStoryIds = await newlyPublishedStoryIds(ctx.db, recipient.since)
    if (newStoryIds.size === 0) continue

    const { ranked } = await rankForYou(ctx.db, recipient.userId)
    const top = ranked.slice(0, ALERT_RANK_LIMIT).find(({ id }) => newStoryIds.has(id))
    if (!top) continue
    const [story] = await storyListItems(ctx.db, [top.id])
    if (!story) continue

    const intents = await withTransaction(ctx.pool, async (tx) => {
      const planned = await createPushDeliveryIntents(
        tx.db,
        recipient.userId,
        story.id,
        recipient.subscriptions,
      )
      return claimPushDeliveryIntents(
        tx.db,
        planned.map((intent) => intent.id),
      )
    })
    if (intents.length === 0) continue

    let sent = false
    for (const batch of chunks(intents, EXPO_BATCH_SIZE)) {
      const messages = batch.map((intent) => forYouExpoMessage(intent.token, story))
      let results: ExpoResult[]
      try {
        results = await sendExpoPush(messages, ctx.config.expoAccessToken)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown Expo Push Service error'
        await markPushDeliveriesUnknown(
          ctx.db,
          batch.map((intent) => intent.id),
          message,
        )
        console.error(`[deliver_expo_push] ambiguous send for ${recipient.userId}: ${message}`)
        continue
      }
      const accepted = results.flatMap((result, index) => {
        const intent = batch[index]
        return result?.status === 'ok' && intent ? [{ id: intent.id, ticketId: result.id }] : []
      })
      const rejected = results.flatMap((result, index) => {
        const intent = batch[index]
        return result?.status === 'error' && intent
          ? [{ id: intent.id, error: result.error, intent }]
          : []
      })

      await recordPushSendResults(ctx.db, accepted, rejected)
      failed += rejected.length
      if (rejected.length) {
        console.error(
          `[deliver_expo_push] ${rejected.length} Expo ticket error(s): ${rejected.map((result) => result.error).join(', ')}`,
        )
      }
      for (const rejectedIntent of rejected) {
        if (rejectedIntent.error !== 'DeviceNotRegistered') continue
        await removeInvalidPushSubscription(ctx.db, {
          userId: recipient.userId,
          token: rejectedIntent.intent.token,
          generation: rejectedIntent.intent.subscriptionGeneration,
        })
        invalidTokens++
      }
      if (accepted.length) sent = true
    }
    if (sent) alerted++
  }

  return { alerted, invalidTokens, receiptsChecked: receipts.checked, failed, reconciled }
}

async function collectExpoReceipts(ctx: WorkerContext) {
  const pending = (await pushTicketsAwaitingReceipt(ctx.db)).filter(
    (delivery): delivery is typeof delivery & { ticketId: string } => delivery.ticketId !== null,
  )
  let checked = 0
  let failedCount = 0
  const invalidSubscriptions: { userId: string; token: string; generation: number }[] = []

  for (const batch of chunks(pending, EXPO_BATCH_SIZE)) {
    const receipts = await getExpoReceipts(
      batch.map((delivery) => delivery.ticketId),
      ctx.config.expoAccessToken,
    )
    const delivered: string[] = []
    const failed: { id: string; error: string }[] = []
    for (const delivery of batch) {
      const receipt = receipts.get(delivery.ticketId)
      if (!receipt) continue
      if (receipt.status === 'ok') delivered.push(delivery.id)
      else {
        failed.push({ id: delivery.id, error: receipt.error })
        failedCount++
        if (receipt.error === 'DeviceNotRegistered') {
          invalidSubscriptions.push({
            userId: delivery.userId,
            token: delivery.token,
            generation: delivery.subscriptionGeneration,
          })
        }
      }
    }
    await recordPushReceipts(
      ctx.db,
      delivered,
      failed,
      batch.map((delivery) => delivery.id),
    )
    checked += batch.length
  }
  for (const subscription of invalidSubscriptions)
    await removeInvalidPushSubscription(ctx.db, subscription)
  if (failedCount) console.error(`[deliver_expo_push] ${failedCount} Expo receipt error(s)`)
  return { checked, invalidTokens: invalidSubscriptions.length, failed: failedCount }
}

export async function sendExpoPush(
  messages: ExpoMessage[],
  accessToken?: string,
): Promise<ExpoResult[]> {
  if (messages.length > EXPO_BATCH_SIZE)
    throw new Error('Expo Push Service batch exceeds 100 messages')
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(messages),
  })
  if (!response.ok) throw new Error(`Expo Push Service returned ${response.status}`)
  return parseExpoResults(await response.json(), messages.length)
}

async function getExpoReceipts(ticketIds: string[], accessToken?: string) {
  const response = await fetch(EXPO_RECEIPTS_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ ids: ticketIds }),
  })
  if (!response.ok) throw new Error(`Expo receipt service returned ${response.status}`)
  return parseExpoReceiptResults(await response.json())
}

function parseExpoResults(value: unknown, expected: number): ExpoResult[] {
  if (!isRecord(value) || !Array.isArray(value.data) || value.data.length !== expected) {
    throw new Error('Expo Push Service returned an invalid ticket response')
  }
  return value.data.map((ticket) => {
    if (!isRecord(ticket)) throw new Error('Expo Push Service returned an invalid ticket')
    if (ticket.status === 'ok' && typeof ticket.id === 'string')
      return { status: 'ok', id: ticket.id }
    if (ticket.status === 'error') return { status: 'error', error: expoError(ticket) }
    throw new Error('Expo Push Service returned an invalid ticket')
  })
}

function parseExpoReceiptResults(value: unknown): Map<string, ExpoResult> {
  if (!isRecord(value) || !isRecord(value.data)) {
    throw new Error('Expo receipt service returned an invalid receipt response')
  }
  const receipts = new Map<string, ExpoResult>()
  for (const [id, receipt] of Object.entries(value.data)) {
    if (!isRecord(receipt)) throw new Error('Expo receipt service returned an invalid receipt')
    if (receipt.status === 'ok') receipts.set(id, { status: 'ok', id })
    else if (receipt.status === 'error')
      receipts.set(id, { status: 'error', error: expoError(receipt) })
    else throw new Error('Expo receipt service returned an invalid receipt')
  }
  return receipts
}

function expoError(value: Record<string, unknown>) {
  return isRecord(value.details) && typeof value.details.error === 'string'
    ? value.details.error
    : typeof value.message === 'string'
      ? value.message
      : 'Unknown Expo Push Service error'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function chunks<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let start = 0; start < items.length; start += size)
    batches.push(items.slice(start, start + size))
  return batches
}
