import { type Db, schema } from '@dn/db'
import {
  DESK_LABELS,
  type Desk,
  type FeedbackRequest,
  type LearnedSignals,
  REGION_LABELS,
  type Region,
  type SignalKind,
  type SignalsRequest,
  TOPIC_LABELS,
  type Topic,
} from '@dn/schemas'
import { and, eq, inArray } from 'drizzle-orm'
import { DomainError } from './story-service.ts'

// A learned weight halves every HALF_LIFE_DAYS without new feedback, and stays within
// ±MAX_WEIGHT so a run of taps can't outweigh what the reader picked on purpose.
export const HALF_LIFE_DAYS = 30
export const MAX_WEIGHT = 3
// Below this, a learned weight is noise: not shown in the list or on cards.
const SHOW_THRESHOLD = 0.25

// How much one tap moves each feature. Regions are broad, so they move less.
// Publishers are left out on purpose: disliking one article shouldn't bury an outlet.
const STEP: Record<SignalKind, number> = { topic: 1, desk: 1, region: 0.5, narrative: 1 }

const DAY_MS = 24 * 3_600_000

export function decayed(weight: number, updatedAt: Date, now = new Date()) {
  const days = (now.getTime() - updatedAt.getTime()) / DAY_MS
  return weight * 0.5 ** (Math.max(0, days) / HALF_LIFE_DAYS)
}

export const clampWeight = (w: number) => Math.max(-MAX_WEIGHT, Math.min(MAX_WEIGHT, w))

type Feature = { kind: SignalKind; key: string }

/** The features a tap on this Story adjusts. */
async function storyFeatures(db: Db, storyId: string): Promise<Feature[]> {
  const [story] = await db
    .select({ desk: schema.story.desk, regions: schema.story.regions, topics: schema.story.topics })
    .from(schema.story)
    .where(eq(schema.story.id, storyId))
  if (!story) throw new DomainError('not_found', `story ${storyId} not found`)
  const narratives = await db
    .select({ id: schema.narrativeStory.narrativeId })
    .from(schema.narrativeStory)
    .where(eq(schema.narrativeStory.storyId, storyId))
  return [
    ...story.topics.map((key) => ({ kind: 'topic' as const, key })),
    ...(story.desk ? [{ kind: 'desk' as const, key: story.desk }] : []),
    ...story.regions.filter((r) => r !== 'global').map((key) => ({ kind: 'region' as const, key })),
    ...narratives.map((n) => ({ kind: 'narrative' as const, key: n.id })),
  ]
}

/** Effective (decayed) learned weights for a reader, keyed "kind:key". */
export async function learnedWeights(db: Db, userId: string, now = new Date()) {
  const rows = await db.select().from(schema.userSignal).where(eq(schema.userSignal.userId, userId))
  return new Map(rows.map((r) => [`${r.kind}:${r.key}`, decayed(r.weight, r.updatedAt, now)]))
}

async function nudge(db: Db, userId: string, features: Feature[], sign: 1 | -1) {
  if (features.length === 0) return
  const now = new Date()
  const current = await learnedWeights(db, userId, now)
  for (const f of features) {
    const weight = clampWeight((current.get(`${f.kind}:${f.key}`) ?? 0) + sign * STEP[f.kind])
    await db
      .insert(schema.userSignal)
      .values({ userId, kind: f.kind, key: f.key, weight, updatedAt: now })
      .onConflictDoUpdate({
        target: [schema.userSignal.userId, schema.userSignal.kind, schema.userSignal.key],
        set: { weight, updatedAt: now },
      })
  }
}

/**
 * Record (or clear) a reader's tap on a Story. Changing or clearing a tap first reverses
 * the previous one, so undo puts the weights back. Clamping can make that inexact at the
 * ±MAX_WEIGHT edges, which is acceptable.
 */
export async function setFeedback(db: Db, userId: string, req: FeedbackRequest) {
  const features = await storyFeatures(db, req.storyId)
  const key = and(
    eq(schema.userStoryFeedback.userId, userId),
    eq(schema.userStoryFeedback.storyId, req.storyId),
  )
  const [previous] = await db.select().from(schema.userStoryFeedback).where(key)
  if (previous?.signal === req.signal) return listSignals(db, userId)
  if (previous) await nudge(db, userId, features, previous.signal === 'more' ? -1 : 1)
  if (req.signal === null) {
    await db.delete(schema.userStoryFeedback).where(key)
  } else {
    await nudge(db, userId, features, req.signal === 'more' ? 1 : -1)
    await db
      .insert(schema.userStoryFeedback)
      .values({ userId, storyId: req.storyId, signal: req.signal })
      .onConflictDoUpdate({
        target: [schema.userStoryFeedback.userId, schema.userStoryFeedback.storyId],
        set: { signal: req.signal, createdAt: new Date() },
      })
  }
  return listSignals(db, userId)
}

export async function storyFeedback(db: Db, userId: string) {
  const rows = await db
    .select({ storyId: schema.userStoryFeedback.storyId, signal: schema.userStoryFeedback.signal })
    .from(schema.userStoryFeedback)
    .where(eq(schema.userStoryFeedback.userId, userId))
  return new Map(rows.map((r) => [r.storyId, r.signal]))
}

/** Human-readable name for a learned feature. */
export function signalLabel(
  kind: SignalKind,
  key: string,
  narratives: ReadonlyMap<string, string>,
) {
  if (kind === 'topic') return TOPIC_LABELS[key as Topic] ?? key
  if (kind === 'desk') return DESK_LABELS[key as Desk] ?? key
  if (kind === 'region') return REGION_LABELS[key as Region] ?? key
  return narratives.get(key) ?? 'A narrative'
}

/** What For You has learned from this reader's taps, strongest first. */
export async function listSignals(db: Db, userId: string): Promise<LearnedSignals> {
  const weights = await learnedWeights(db, userId)
  const visible = [...weights.entries()]
    .map(([k, weight]) => {
      const [kind, ...rest] = k.split(':')
      return { kind: kind as SignalKind, key: rest.join(':'), weight }
    })
    .filter((s) => Math.abs(s.weight) >= SHOW_THRESHOLD)
  const narrativeIds = visible.filter((s) => s.kind === 'narrative').map((s) => s.key)
  const narratives = narrativeIds.length
    ? await db
        .select({ id: schema.narrative.id, title: schema.narrative.title })
        .from(schema.narrative)
        .where(inArray(schema.narrative.id, narrativeIds))
    : []
  const titles = new Map(narratives.map((n) => [n.id, n.title]))
  return {
    items: visible
      .map((s) => ({ ...s, label: signalLabel(s.kind, s.key, titles) }))
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
  }
}

/** Remove one learned feature, or reset everything (taps included, so hidden cards return). */
export async function updateSignals(db: Db, userId: string, req: SignalsRequest) {
  if ('reset' in req) {
    await db.delete(schema.userSignal).where(eq(schema.userSignal.userId, userId))
    await db.delete(schema.userStoryFeedback).where(eq(schema.userStoryFeedback.userId, userId))
  } else {
    await db
      .delete(schema.userSignal)
      .where(
        and(
          eq(schema.userSignal.userId, userId),
          eq(schema.userSignal.kind, req.remove.kind),
          eq(schema.userSignal.key, req.remove.key),
        ),
      )
  }
  return listSignals(db, userId)
}
