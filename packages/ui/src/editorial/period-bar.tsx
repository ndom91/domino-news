import type { ReactNode } from 'react'
import { cx } from '../cx.ts'

/**
 * Heading for a period or group inside a section (Today, Yesterday, This week): a smaller
 * LATEST over a heavy ink rule. Deliberately uncoloured, so it never reads as a desk bar.
 */
export function PeriodBar({
  title,
  meta,
  id,
  className,
}: {
  title: ReactNode
  meta?: ReactNode
  id?: string
  className?: string
}) {
  return (
    <div
      className={cx(
        'flex items-baseline justify-between gap-4 border-b-4 border-rule pb-2',
        className,
      )}
    >
      <h2 id={id} className="min-w-0 type-period">
        {title}
      </h2>
      {meta ? <span className="flex-none text-label text-text-muted">{meta}</span> : null}
    </div>
  )
}
