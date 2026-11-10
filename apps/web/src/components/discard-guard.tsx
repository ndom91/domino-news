import { ConfirmDialog } from '@dn/ui'
import { useBlocker } from '@tanstack/react-router'
import type { ReactNode } from 'react'

/**
 * While `when` is true, leaving the page asks first: in-app navigation opens a "Discard
 * changes" dialog, and closing or reloading the tab shows the browser's own prompt.
 */
export function DiscardGuard({
  when,
  title,
  children,
}: {
  when: boolean
  title: string
  /** What is lost, e.g. "Your name has not been saved." */
  children: ReactNode
}) {
  const blocker = useBlocker({
    shouldBlockFn: () => when,
    enableBeforeUnload: when,
    withResolver: true,
  })
  return (
    <ConfirmDialog
      open={blocker.status === 'blocked'}
      title={title}
      confirmLabel="Discard changes"
      cancelLabel="Keep editing"
      destructive
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    >
      {children}
    </ConfirmDialog>
  )
}
