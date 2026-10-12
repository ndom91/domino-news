import { LEAN_MIX_MIN_RATED, plural } from '@dn/domain'
import { LEAN_LABELS, type PublisherLean, publisherLeanSchema, type StoryLean } from '@dn/schemas'
import { cx } from '../cx.ts'
import { DefaultLink, type LinkLike } from './link.tsx'

const LEANS = publisherLeanSchema.options

// Blue for left, red for right, stronger further from centre. The bar's order and the
// labelled rows below still carry the meaning without colour.
export const LEAN_FILL: Record<PublisherLean, string> = {
  left: 'bg-lean-left',
  centre_left: 'bg-lean-centre-left',
  centre: 'bg-text-muted',
  centre_right: 'bg-lean-centre-right',
  right: 'bg-lean-right',
}

// Hatching for "not rated": shape, not colour, says it's empty (same as `PositionScale`).
const HATCH = {
  backgroundImage: 'repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 6px)',
}

/**
 * Who covered a Story in one country, by each publisher's reviewed lean. Unrated publishers
 * always get their own hatched segment, so a bar built on a few ratings never looks like
 * the whole picture. The rows below carry every number and name; the bar repeats them.
 */
export function LeanSpread({
  lean,
  countryLabel,
  Link = DefaultLink,
  className,
}: {
  lean: StoryLean
  countryLabel: string
  Link?: LinkLike
  className?: string
}) {
  const rated = lean.publishers.filter((p) => p.lean).length
  const estimated = lean.publishers.filter((p) => p.lean && p.estimated).length
  const unrated = lean.publishers.filter((p) => !p.lean)
  const rows = LEANS.map((key) => ({
    key,
    publishers: lean.publishers.filter((p) => p.lean === key),
  }))
  const enough = rated >= LEAN_MIX_MIN_RATED

  return (
    <figure className={className}>
      <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="type-label text-text-muted">Publishers in {countryLabel}</span>
        <span className="type-meta">
          {rated} of {plural(lean.publishers.length, 'publisher')} rated
          {estimated ? `, ${estimated} estimated` : null}
        </span>
      </figcaption>

      {enough ? (
        <>
          <div className="flex h-3 gap-0.5" aria-hidden>
            {rows.map((r) =>
              r.publishers.length ? (
                <span
                  key={r.key}
                  className={LEAN_FILL[r.key]}
                  style={{ flexGrow: r.publishers.length }}
                />
              ) : null,
            )}
            {unrated.length ? (
              <span className="text-border-strong" style={{ ...HATCH, flexGrow: unrated.length }} />
            ) : null}
          </div>
          <div className="mt-1.5 flex justify-between type-meta" aria-hidden>
            <span>Left</span>
            <span>Right</span>
          </div>
          <ul className="mt-3 flex flex-col">
            {rows.map((r) => (
              <LeanRow
                key={r.key}
                label={LEAN_LABELS[r.key]}
                swatch={<span className={cx('size-3 flex-none', LEAN_FILL[r.key])} />}
                publishers={r.publishers}
                Link={Link}
              />
            ))}
            {unrated.length ? (
              <LeanRow
                label="Not rated"
                swatch={<span className="size-3 flex-none text-border-strong" style={HATCH} />}
                publishers={unrated}
                Link={Link}
              />
            ) : null}
          </ul>
        </>
      ) : (
        <p className="text-sm text-text-secondary">
          Not enough rated publishers yet. A mix needs at least {LEAN_MIX_MIN_RATED}.
        </p>
      )}

      {lean.oneSided ? (
        <p className="mt-3 border-l-2 border-text pl-3 text-sm font-bold">
          Mostly covered by {lean.oneSided}-leaning publishers in {countryLabel}
        </p>
      ) : null}
    </figure>
  )
}

function LeanRow({
  label,
  swatch,
  publishers,
  Link,
}: {
  label: string
  swatch: React.ReactNode
  publishers: StoryLean['publishers']
  Link: LinkLike
}) {
  return (
    <li className="grid grid-cols-[minmax(7.5rem,auto)_2ch_1fr] items-baseline gap-3 py-1 text-sm">
      <span className={cx('flex items-center gap-2', !publishers.length && 'text-text-muted')}>
        <span aria-hidden className="flex">
          {swatch}
        </span>
        {label}
      </span>
      <span className={cx('text-right font-bold', !publishers.length && 'text-text-muted')}>
        {publishers.length}
      </span>
      <span className="text-text-secondary">
        {publishers.map((p, i) => (
          <span key={p.publisher.id}>
            {i > 0 ? ', ' : null}
            <Link
              to={`/publishers/${p.publisher.slug}`}
              className="underline-offset-4 hover:text-text hover:underline"
            >
              {p.publisher.name}
            </Link>
            {p.estimated ? <span className="text-text-muted"> (estimated)</span> : null}
          </span>
        ))}
      </span>
    </li>
  )
}
