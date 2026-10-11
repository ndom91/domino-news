import { cx } from '@dn/ui'
import type { ReactNode } from 'react'

/** Page column: max 1440 including gutters. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('mx-auto max-w-page px-gutter pt-8 md:pt-10', className)}>{children}</div>
  )
}

/** Page title in the section style (uppercase, condensed), with optional meta on the right. */
export function PageTitle({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <div className="mb-8 flex items-baseline justify-between gap-4 max-md:flex-col max-md:gap-1">
      <h1 className="type-section">{children}</h1>
      {meta ? <span className="text-label text-text-muted">{meta}</span> : null}
    </div>
  )
}
