import { type Db, schema } from '@dn/db'
import type pg from 'pg'
import { touchNarrative, touchStory } from './outbox.ts'

// Everything produced by ingestion and analysis. Users, publishers and feeds are kept.
const INGESTED_TABLES = [
  'claim_evidence',
  'claim_mention',
  'claim',
  'story_context',
  'context_entry_version',
  'context_entry',
  'story_summary_source',
  'story_summary_version',
  'story_source_reference',
  'source_reference',
  'narrative_story',
  'narrative',
  'story_relationship',
  'story_lineage_event',
  'story_alias',
  'story_article',
  'reading_event',
  'story',
  'interpretation_evidence',
  'interpretation',
  'analysis_run',
  'article_embedding',
  'feed_entry',
  'outbox_event',
  'inbox_event',
  'search_projection_state',
  'observation',
  'article_revision',
  'article',
  'pipeline_control',
]
const SOURCE_AND_ACCOUNT_TABLES = [
  'feed',
  'publisher_assessment',
  'publisher_evidence',
  'publisher',
  'user_follow',
  'user_preference',
  'auth_passkey',
  'auth_session',
  'auth_account',
  'auth_user',
  'auth_verification',
]

/**
 * Dev/test only: delete all ingested and derived data and pending jobs.
 * TRUNCATE intentionally bypasses the append-only row triggers.
 */
export async function resetIngestedData(
  pool: pg.Pool,
  opts: { includeSourcesAndAccounts?: boolean } = {},
) {
  const tables = opts.includeSourcesAndAccounts
    ? [...INGESTED_TABLES, ...SOURCE_AND_ACCOUNT_TABLES]
    : INGESTED_TABLES
  await pool.query(`truncate ${tables.join(', ')} cascade`)
  if (!opts.includeSourcesAndAccounts) {
    await pool.query(
      'update feed set last_polled_at = null, last_status = null, last_error = null, etag = null, last_modified = null',
    )
  }
  await pool.query('delete from pgboss.job').catch((error: { code?: string }) => {
    if (error.code !== '42P01') throw error // undefined_table: pg-boss not installed yet
  })
}

/**
 * Remove all Story relationships and Narratives so they can be re-derived. Emits outbox
 * events so the search index drops the narratives and refreshes the stories.
 */
export async function resetStoryGraph(db: Db) {
  await db.transaction(async (tx) => {
    const narratives = await tx.select({ id: schema.narrative.id }).from(schema.narrative)
    const stories = await tx.select({ id: schema.story.id }).from(schema.story)
    for (const n of narratives) await touchNarrative(tx, n.id, 'narrative.removed')
    for (const s of stories) await touchStory(tx, s.id, 'story.graph_reset', null)
    await tx.delete(schema.narrativeStory)
    await tx.delete(schema.narrative)
    await tx.delete(schema.storyRelationship)
  })
}
