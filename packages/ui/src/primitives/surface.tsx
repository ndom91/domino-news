import type { ComponentProps, ReactNode } from 'react'
import { cx } from '../cx.ts'

/** Plain grouping block: a hairline box or a sunken panel. No radius, no shadow. */
export function Card({
  tone = 'plain',
  padded = true,
  className,
  ...props
}: ComponentProps<'div'> & { tone?: 'plain' | 'sunken'; padded?: boolean }) {
  return (
    <div
      {...props}
      className={cx(
        tone === 'plain' ? 'border border-border' : 'bg-sunken',
        padded && 'p-4 md:p-5',
        className,
      )}
    />
  )
}

type BadgeTone = 'neutral' | 'ink' | 'success' | 'warning' | 'error'

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-sunken text-text',
  ink: 'bg-text text-canvas',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  error: 'bg-error-subtle text-error',
}

/** Small uppercase status flag. Only for real states (Correction, Failed, Paused), never decoration. */
export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cx(
        'inline-flex h-fit items-center self-center px-1.5 py-0.5 text-2xs font-extrabold tracking-[0.05em] uppercase',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx('t-skel block bg-sunken', className)} />
}

/** Empty, error and info states: one plain line of direction, no illustration. */
export function Notice({
  tone = 'neutral',
  title,
  children,
  action,
  className,
}: {
  tone?: 'neutral' | 'error'
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'flex flex-col items-start gap-2 border-l-2 py-1 pl-4',
        tone === 'error' ? 'border-error' : 'border-rule',
        className,
      )}
    >
      <p className={cx('font-bold', tone === 'error' ? 'text-error' : 'text-text')}>{title}</p>
      {children ? (
        <div className="max-w-reading text-base text-text-secondary">{children}</div>
      ) : null}
      {action}
    </div>
  )
}
