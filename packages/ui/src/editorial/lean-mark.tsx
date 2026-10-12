import { type PublisherLean, publisherLeanSchema } from '@dn/schemas'
import { cx } from '../cx.ts'
import { LEAN_FILL } from './lean-spread.tsx'

const LEANS = publisherLeanSchema.options

/**
 * A publisher's lean as a small inline scale: the publisher page's `PositionScale`, sized for
 * a line of meta text. Decorative: always pair it with the lean in words.
 */
export function LeanMark({ lean, className }: { lean: PublisherLean; className?: string }) {
  const at = LEANS.indexOf(lean)
  return (
    <span aria-hidden className={cx('relative inline-block h-2.5 w-14 flex-none', className)}>
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-text-muted" />
      {LEANS.map((l, i) => (
        <span
          key={l}
          className={cx(
            'absolute top-1/2 -translate-x-1/2 -translate-y-1/2',
            i === at ? 'size-2.5 border border-text' : 'h-2 w-0.5',
            LEAN_FILL[l],
          )}
          style={{ left: `${(i / (LEANS.length - 1)) * 100}%` }}
        />
      ))}
    </span>
  )
}
