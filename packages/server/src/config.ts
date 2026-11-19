import { INFERENCE_SETTINGS_LIMITS } from '@dn/schemas'
import { readAppleConfig } from './apple.ts'

// Central env parsing for server-side processes (web, worker, indexer).
export function readConfig(env = process.env) {
  const num = (key: string, fallback: number) => {
    const raw = env[key]
    const value = raw === undefined || raw === '' ? fallback : Number(raw)
    if (!Number.isFinite(value)) throw new Error(`${key} must be a number`)
    return value
  }
  const boundedNum = (key: string, fallback: number, min: number, max: number) => {
    const value = num(key, fallback)
    if (value < min || value > max) throw new Error(`${key} must be between ${min} and ${max}`)
    return value
  }
  return {
    databaseUrl: env.DATABASE_URL ?? 'postgres://dn:dn@localhost:5442/dn',
    typesenseUrl: env.TYPESENSE_URL ?? 'http://localhost:8108',
    typesenseApiKey: env.TYPESENSE_API_KEY ?? 'dev-typesense-key',
    ingestMode: env.INGEST_MODE === 'live' ? ('live' as const) : ('fixture' as const),
    fixtureDir: env.FIXTURE_DIR ?? 'fixtures',
    feedPollCron: env.FEED_POLL_CRON ?? '*/15 * * * *',
    freshWindowHours: num('FRESH_WINDOW_HOURS', 12),
    backfillAdmitPerMinute: num('BACKFILL_ADMIT_PER_MINUTE', 20),
    embeddingConcurrency: num('EMBEDDING_CONCURRENCY', 2),
    generationConcurrency: num('GENERATION_CONCURRENCY', 2),
    matchDecisionConfidence: boundedNum('MATCH_DECISION_CONFIDENCE', 0.8, 0, 1),
    publishedSummaryDebounceSeconds: boundedNum(
      'PUBLISHED_SUMMARY_DEBOUNCE_SECONDS',
      180,
      INFERENCE_SETTINGS_LIMITS.publishedSummaryDebounceSeconds.min,
      INFERENCE_SETTINGS_LIMITS.publishedSummaryDebounceSeconds.max,
    ),
    summaryUpdateAssessmentMaxArticles: boundedNum(
      'SUMMARY_UPDATE_ASSESSMENT_MAX_ARTICLES',
      5,
      INFERENCE_SETTINGS_LIMITS.summaryUpdateAssessmentMaxArticles.min,
      INFERENCE_SETTINGS_LIMITS.summaryUpdateAssessmentMaxArticles.max,
    ),
    summaryMaxAgeHours: num('SUMMARY_MAX_AGE_HOURS', 24 * 14),
    // A Story is summarised (and so published) only once this many distinct newsroom
    // publishers cover it. Official sources attach but don't count.
    minPublishOutlets: num('MIN_PUBLISH_OUTLETS', 2),
    // Feed items published longer ago than this are not ingested at all.
    maxArticleAgeDays: num('MAX_ARTICLE_AGE_DAYS', 3),
    enableSummaryEditing: env.ENABLE_SUMMARY_EDITING === 'true',
    googleSignIn: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    // The web redirect flow needs the Services ID; the iOS app works without it.
    appleSignIn: Boolean(readAppleConfig(env)?.webClientId),
    eventRetentionDays: num('EVENT_RETENTION_DAYS', 7),
    expoPushDeliveryCron: env.EXPO_PUSH_DELIVERY_CRON ?? '*/5 * * * *',
    expoAccessToken: env.EXPO_ACCESS_TOKEN || undefined,
    // Secret (sk_) key for logo.dev. Without it publishers show no logo.
    logoDevApiKey: env.LOGO_DEV_API_KEY || undefined,
  }
}

export type Config = ReturnType<typeof readConfig>
