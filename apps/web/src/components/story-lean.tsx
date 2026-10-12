import { countryName, LEAN_MIX_MIN_RATED, plural } from '@dn/domain'
import type { StoryLean as StoryLeanData } from '@dn/schemas'
import { LeanSpread, SectionLabel } from '@dn/ui'
import { RouterLink } from './link.tsx'

const hasEnough = (m: StoryLeanData) =>
  m.publishers.filter((p) => p.lean).length >= LEAN_MIX_MIN_RATED

/**
 * The lean mix of a Story's publishers: the reader's country first (else the best-rated one),
 * other countries folded away. Leans are only comparable within one country, and countries
 * with too few ratings are named on one line instead of each getting an empty chart.
 */
export function StoryLean({ mix, country }: { mix: StoryLeanData[]; country: string | null }) {
  if (mix.length === 0) return null
  const shown = mix.filter(hasEnough)
  const thin = mix.filter((m) => !hasEnough(m))
  const main = shown.find((m) => m.country === country) ?? shown[0]
  const others = shown.filter((m) => m !== main)
  const publisherCount = mix.reduce((n, m) => n + m.publishers.length, 0)

  return (
    <section aria-labelledby="lean-heading">
      <SectionLabel id="lean-heading">Political lean</SectionLabel>
      {main ? (
        <LeanSpread lean={main} countryLabel={countryName(main.country)} Link={RouterLink} />
      ) : (
        <p className="text-sm text-text-secondary">
          Not enough of the {plural(publisherCount, 'publisher')} here have a reviewed lean yet.
        </p>
      )}
      {others.length ? (
        <details className="t-acc mt-4 border-t border-border pt-3">
          <summary className="cursor-pointer list-none type-label text-text-muted [&::-webkit-details-marker]:hidden">
            <span aria-hidden className="t-acc-chevron mr-1.5">
              ›
            </span>
            Other countries ({others.length})
          </summary>
          <div className="mt-4 flex flex-col gap-6">
            {others.map((m) => (
              <LeanSpread
                key={m.country}
                lean={m}
                countryLabel={countryName(m.country)}
                Link={RouterLink}
              />
            ))}
          </div>
        </details>
      ) : null}
      {main && thin.length ? (
        <p className="mt-4 text-sm text-text-secondary">
          Too few rated publishers to show: {thin.map((m) => countryName(m.country)).join(', ')}.
        </p>
      ) : null}
      <p className="mt-4 text-xs text-text-muted">
        Each publisher’s lean is relative to its own country’s media, from our reviewed assessments.
        Most come from audience surveys or ratings; where none exists, we estimate it from public
        research and say so. Estimates never mark a story as one-sided.
      </p>
    </section>
  )
}
