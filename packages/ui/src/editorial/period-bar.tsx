import type { ReactNode } from 'react'

/**
 * Heading for a period or group inside a section (Today, Yesterday, This week): a smaller
 * LATEST over a heavy ink rule. Deliberately uncoloured, so it never reads as a desk bar.
 */
export function PeriodBar({
  title,
  meta,
  id,
}: {
  title: ReactNode
  meta?: ReactNode
  id?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b-4 border-rule pb-2">
      <h2 id={id} className="min-w-0 type-period">
        {title}
      </h2>
      {meta ? <span className="flex-none text-label text-text-muted">{meta}</span> : null}
    </div>
  )
}
