import type { ReactNode } from 'react'
import { cx } from '../cx.ts'

/**
 * Uppercase section title (LATEST, DEVELOPING) with meta on the right. `rule` underlines it in
 * the accent, for pages with many sections (the Story page) where they must stand out.
 */
export function SectionHeader({
  title,
  meta,
  id,
  muted = 'text-text-muted',
  rule = false,
  className,
}: {
  title: ReactNode
  meta?: ReactNode
  id?: string
  muted?: string
  rule?: boolean
  className?: string
}) {
  return (
    <div
      className={cx(
        'flex items-baseline justify-between gap-4 pt-10 pb-4',
        rule && 'mb-5 border-b-4 border-accent',
        className,
      )}
    >
      <h2 id={id} className="type-section">
        {title}
      </h2>
      {meta ? <span className={cx('text-label', muted)}>{meta}</span> : null}
    </div>
  )
}

/** Small uppercase label over an accent rule, used to open page sections. */
export function SectionLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mb-4 border-b-2 border-accent pb-2 type-label">
      {children}
    </h2>
  )
}
