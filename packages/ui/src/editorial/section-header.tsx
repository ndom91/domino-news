import type { ReactNode } from 'react'
import { cx } from '../cx.ts'

/** Uppercase section title (LATEST, DEVELOPING) with meta on the right. */
export function SectionHeader({
  title,
  meta,
  id,
  muted = 'text-text-muted',
  className,
}: {
  title: ReactNode
  meta?: ReactNode
  id?: string
  muted?: string
  className?: string
}) {
  return (
    <div className={cx('flex items-baseline justify-between gap-4 pt-10 pb-4', className)}>
      <h2 id={id} className="type-section">
        {title}
      </h2>
      {meta ? <span className={cx('text-label', muted)}>{meta}</span> : null}
    </div>
  )
}

/** Small uppercase label over a rule, used to open page sections. */
export function SectionLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mb-4 border-b-2 border-rule pb-2 type-label">
      {children}
    </h2>
  )
}
