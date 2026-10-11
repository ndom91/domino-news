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
        'flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pt-10 pb-4',
        rule && 'mb-5 border-b-4 border-accent',
        className,
      )}
    >
      {/* Trimmed to cap height so its box ends at the baseline: the meta's underline or
          select border then lines up with the bottom of the title. */}
      <h2 id={id} className="type-section [text-box:trim-both_cap_alphabetic]">
        {title}
      </h2>
      {meta ? <span className={cx('min-w-0 text-label', muted)}>{meta}</span> : null}
    </div>
  )
}

/** Small uppercase label over an accent rule, used to open page sections. */
export function SectionLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mb-4 border-b-4 border-accent pb-2 type-label">
      {children}
    </h2>
  )
}
