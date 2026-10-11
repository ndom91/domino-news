import { formatDate, plural, truncate } from '@dn/domain'
import type { DevelopingNarrative, NarrativeStep } from '@dn/schemas'
import { cx } from '../cx.ts'
import { positionKey } from './desk-key.ts'
import { DefaultLink, type LinkLike } from './link.tsx'
import { Timestamp } from './time.tsx'

function stepRelation(step: NarrativeStep) {
  const rel = step.relation
  if (!rel) return null
  const short = truncate(rel.title, 34)
  switch (rel.type) {
    case 'follows':
      return 'Follows'
    case 'branches_from':
      return `Branches from ${short}`
    case 'corrects':
      return `Corrects ${formatDate(rel.at)}`
    case 'responds_to':
      return `Responds to ${short}`
    case 'provides_context_for':
      return `Background for ${short}`
    case 'related_to':
      return `Related to ${short}`
  }
}

/**
 * A Narrative's Stories oldest first on a vertical line. The latest step is filled with the
 * Narrative's key colour and bold; corrected steps are struck through in orange.
 * Designed for the always-dark band.
 */
function NarrativeSteps({
  steps,
  Link = DefaultLink,
}: {
  steps: NarrativeStep[]
  Link?: LinkLike
}) {
  return (
    <ol className="mt-5.5">
      {steps.map((step, i) => {
        const latest = i === steps.length - 1
        const branch = step.relation?.type === 'branches_from'
        const label = stepRelation(step)
        return (
          <li
            key={step.storyId}
            className={cx(
              'relative grid grid-cols-[4rem_1.125rem_minmax(0,1fr)] items-start gap-x-2.5 pb-3 text-base leading-snug',
              !latest &&
                'before:absolute before:top-3.5 before:-bottom-0.5 before:left-[calc(4rem+0.625rem+0.5625rem-1px)] before:w-0.5 before:bg-band-line',
              latest && 'font-bold',
            )}
          >
            <time
              dateTime={step.firstObservedAt}
              className={cx('pt-px text-sm', latest ? 'text-band-text' : 'text-band-muted')}
            >
              {formatDate(step.firstObservedAt)}
            </time>
            <span
              aria-hidden
              className={cx(
                'relative z-10 justify-self-center',
                latest
                  ? 'mt-0.5 size-3.5 bg-key'
                  : 'mt-[3px] size-3 bg-band shadow-[inset_0_0_0_2px_var(--dn-band-text)]',
              )}
            />
            <span className={cx(branch && 'border-l-2 border-band-line pl-3.5')}>
              {label ? (
                <span className="block text-xs font-semibold tracking-label text-band-muted uppercase">
                  {label}
                </span>
              ) : null}
              <Link
                to={`/stories/${step.slug}`}
                className={cx(
                  'hover:underline',
                  step.correctedAt && 'text-band-muted line-through decoration-accent',
                )}
              >
                {step.title}
              </Link>
              {step.correctedAt ? (
                <span className="block text-xs font-semibold tracking-label text-band-muted uppercase">
                  Corrected on {formatDate(step.correctedAt)}
                </span>
              ) : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * One Narrative in the Developing band: key-colour rule, title, meta and its step list.
 * Coloured by `position`, so neighbouring columns never share a desk colour.
 */
export function NarrativeColumn({
  narrative,
  position,
  Link = DefaultLink,
}: {
  narrative: DevelopingNarrative
  position: number
  Link?: LinkLike
}) {
  return (
    <div className={cx(positionKey(position), 'min-w-0 border-t-6 border-key pt-4')}>
      <h3 className="mb-1.5 type-narrative-title">
        <Link
          to={`/narratives/${narrative.slug}`}
          className="hover:underline hover:decoration-key hover:decoration-3 hover:underline-offset-5"
        >
          {narrative.title}
        </Link>
      </h3>
      <p className="text-sm text-band-muted">
        {plural(narrative.storyCount, 'story', 'stories')} since {formatDate(narrative.since)} ·
        updated <Timestamp at={narrative.updatedAt} />
      </p>
      <NarrativeSteps steps={narrative.steps} Link={Link} />
    </div>
  )
}
