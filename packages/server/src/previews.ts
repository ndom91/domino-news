import { type Db, schema } from '@dn/db'
import { plural, stripCitations, truncate } from '@dn/domain'
import { DESK_LABELS, type Desk, type Preview, type PreviewType } from '@dn/schemas'
import { and, eq, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { findNarrative } from './narratives.ts'

const DESCRIPTION_MAX = 200

/** The first sentence of a summary as plain text, for share cards and teasers. */
export function firstSentence(text: string | null | undefined): string | null {
  if (!text) return null
  // Removing a marker can leave a space before punctuation ("2027 [3]." → "2027 .").
  const plain = stripCitations(text)
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim()
  const [sentence] = plain.split(/(?<=[.!?])\s+(?=[A-Z"“‘(])/)
  return sentence ? truncate(sentence, DESCRIPTION_MAX) : null
}

const deskLabel = (desk: Desk | null) => (desk ? DESK_LABELS[desk] : 'News')

/** A story's share card. A `StoryDetail` has every field it reads. */
export function storyPreview(story: {
  slug: string
  title: string
  desk: Desk | null
  lastUpdatedAt: string
  summary: { versionId: string; body: string } | null
  narratives: { title: string }[]
}): Preview {
  const narrative = story.narratives[0]
  return {
    type: 'story',
    slug: story.slug,
    title: story.title,
    kicker: narrative ? `${deskLabel(story.desk)} · ${narrative.title}` : deskLabel(story.desk),
    description: firstSentence(story.summary?.body),
    desk: story.desk,
    version: story.summary?.versionId ?? story.lastUpdatedAt,
  }
}

/** A narrative's share card. A `NarrativeDetail` has every field it reads. */
export function narrativePreview(narrative: {
  slug: string
  title: string
  desk: Desk | null
  description: string | null
  updatedAt: string
}): Preview {
  return {
    type: 'narrative',
    slug: narrative.slug,
    title: narrative.title,
    kicker: `${deskLabel(narrative.desk)} · Narrative`,
    description: firstSentence(narrative.description),
    desk: narrative.desk,
    version: narrative.updatedAt,
  }
}

/**
 * The public face of a story, narrative or publisher, for signed-out visitors and link-preview
 * crawlers. Each kind reads only what its card shows. Not cached: any slug can be requested,
 * and cached() never evicts.
 */
export async function getPreview(db: Db, type: PreviewType, slug: string): Promise<Preview | null> {
  if (type === 'story') return previewStory(db, slug)
  if (type === 'narrative') {
    const row = await findNarrative(db, slug)
    if (!row) return null
    const { narrative, desk } = row
    return narrativePreview({ ...narrative, desk, updatedAt: narrative.updatedAt.toISOString() })
  }
  return previewPublisher(db, slug)
}

async function previewStory(db: Db, slug: string): Promise<Preview | null> {
  const [story] = await db
    .select({
      slug: schema.story.slug,
      title: schema.story.title,
      desk: schema.story.desk,
      publishedAt: schema.story.publishedAt,
      lastUpdatedAt: schema.story.lastUpdatedAt,
      summary: { versionId: schema.storySummaryVersion.id, body: schema.storySummaryVersion.body },
      narrativeTitle: sql<string | null>`(
        select n.title from narrative_story ns join narrative n on n.id = ns.narrative_id
        where ns.story_id = story.id and ns.removed_at is null
        order by ns.added_at limit 1)`,
    })
    .from(schema.story)
    .leftJoin(
      schema.storySummaryVersion,
      eq(schema.storySummaryVersion.id, schema.story.currentSummaryId),
    )
    .where(or(eq(schema.story.id, slug), eq(schema.story.slug, slug)))
  // Unpublished stories stay private.
  if (!story?.publishedAt) return null
  return storyPreview({
    ...story,
    lastUpdatedAt: story.lastUpdatedAt.toISOString(),
    narratives: story.narrativeTitle ? [{ title: story.narrativeTitle }] : [],
  })
}

async function previewPublisher(db: Db, slug: string): Promise<Preview | null> {
  const [publisher] = await db
    .select({
      slug: schema.publisher.slug,
      name: schema.publisher.name,
      storiesCovered: sql<number>`count(distinct ${schema.story.id})::int`,
    })
    .from(schema.publisher)
    .leftJoin(schema.article, eq(schema.article.publisherId, schema.publisher.id))
    .leftJoin(
      schema.storyArticle,
      and(
        eq(schema.storyArticle.articleId, schema.article.id),
        isNull(schema.storyArticle.removedAt),
      ),
    )
    .leftJoin(
      schema.story,
      and(eq(schema.story.id, schema.storyArticle.storyId), isNotNull(schema.story.publishedAt)),
    )
    .where(eq(schema.publisher.slug, slug))
    .groupBy(schema.publisher.id)
  if (!publisher) return null
  return {
    type: 'publisher',
    slug: publisher.slug,
    title: publisher.name,
    kicker: 'Publisher',
    description: `${plural(publisher.storiesCovered, 'story', 'stories')} covered. Funding, reliability and political lean, reviewed on Domino.`,
    desk: null,
    version: publisher.slug,
  }
}
