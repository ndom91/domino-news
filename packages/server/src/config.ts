// Central env parsing for server-side processes (web, worker, indexer).
export function readConfig(env = process.env) {
  const num = (key: string, fallback: number) => {
    const raw = env[key]
    const value = raw === undefined || raw === '' ? fallback : Number(raw)
    if (!Number.isFinite(value)) throw new Error(`${key} must be a number`)
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
    summaryMaxAgeHours: num('SUMMARY_MAX_AGE_HOURS', 24 * 14),
    enableSummaryEditing: env.ENABLE_SUMMARY_EDITING === 'true',
    googleSignIn: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    eventRetentionDays: num('EVENT_RETENTION_DAYS', 7),
  }
}

export type Config = ReturnType<typeof readConfig>
