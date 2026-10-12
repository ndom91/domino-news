import type { Db } from '@dn/db'
import { plural, stripCitations, truncate } from '@dn/domain'
import {
  DESK_LABELS,
  type Desk,
  type NarrativeDetail,
  type Preview,
  type PreviewType,
  type StoryDetail,
} from '@dn/schemas'
import { getPublisher } from './publishers.ts'
import { getNarrative, getStory } from './reader.ts'

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

export function storyPreview(story: StoryDetail): Preview {
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

export function narrativePreview(narrative: NarrativeDetail): Preview {
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
 * The public face of a story, narrative or publisher. Reuses the full reads (which already
 * hide unpublished stories) and keeps only what a share card shows.
 */
export async function getPreview(db: Db, type: PreviewType, slug: string): Promise<Preview | null> {
  if (type === 'story') {
    const story = await getStory(db, slug)
    return story ? storyPreview(story) : null
  }
  if (type === 'narrative') {
    const narrative = await getNarrative(db, slug)
    return narrative ? narrativePreview(narrative) : null
  }
  const publisher = await getPublisher(db, slug)
  if (!publisher) return null
  return {
    type,
    slug: publisher.slug,
    title: publisher.name,
    kicker: 'Publisher',
    description: `${plural(publisher.storiesCovered, 'story', 'stories')} covered. Funding, reliability and political lean, reviewed on Domino.`,
    desk: null,
    version: publisher.slug,
  }
}
