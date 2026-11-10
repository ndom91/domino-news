import { combinedStoryLean } from '@dn/domain'
import type { StoryLean as StoryLeanData } from '@dn/schemas'
import { LeanSpread, SectionLabel } from '@dn/ui'
import { RouterLink } from './link.tsx'

/**
 * The Story-level lean bar combines its covering publishers on Domino's shared scale. Each
 * publisher retains the country context of the evidence that informed its assessment.
 */
export function StoryLean({ mix }: { mix: StoryLeanData[] }) {
  const lean = combinedStoryLean(mix)
  if (!lean) return null

  return (
    <section aria-labelledby="lean-heading">
      <SectionLabel id="lean-heading">Political lean</SectionLabel>
      <LeanSpread lean={lean} Link={RouterLink} />
      <p className="mt-4 text-xs text-text-muted">
        This is a shared product scale. Every assessment keeps the country context and source
        evidence behind its label. Most come from audience surveys or ratings; where none exists, we
        estimate it from public research and say so. Estimates never mark a story as one-sided.
      </p>
    </section>
  )
}
