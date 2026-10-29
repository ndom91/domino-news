import type { PublisherLean, StoryLean, StorySource } from '@dn/schemas'

export const REPORTING_GROUPS: (PublisherLean | 'unrated')[] = [
  'left',
  'centre_left',
  'centre',
  'centre_right',
  'right',
  'unrated',
]

export function groupReporting(sources: StorySource[], leanMix: StoryLean[]) {
  const ratings = new Map(
    leanMix.flatMap((mix) =>
      mix.publishers.map((publisher) => [publisher.publisher.id, publisher] as const),
    ),
  )
  const ordered = [...sources].sort((a, b) =>
    (a.publishedAt ?? a.observedAt).localeCompare(b.publishedAt ?? b.observedAt),
  )
  const groups = REPORTING_GROUPS.map((group) => ({
    group,
    items: ordered.filter(
      (source) =>
        (source.official ? 'unrated' : (ratings.get(source.publisher.id)?.lean ?? 'unrated')) ===
        group,
    ),
  }))
  return { ordered, ratings, groups }
}
