import { cx } from '@dn/ui'
import type { ReactNode } from 'react'

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('mx-auto max-w-content px-(--dn-gutter) pt-8 md:pt-10', className)}>
      {children}
    </div>
  )
}

/** Small uppercase section label that names the content below it. */
export function SectionLabel({
  children,
  as: As = 'h2',
}: {
  children: ReactNode
  as?: 'h2' | 'h3'
}) {
  return (
    <As className="mb-4 border-b border-rule pb-2 text-xs font-semibold uppercase tracking-label text-text">
      {children}
    </As>
  )
}
