import type { ComponentProps, ReactNode } from 'react'
import { cx } from '../cx.ts'

export interface CardProps extends ComponentProps<'div'> {
  /** `plain` = surface with border; `sunken` = inset panel for secondary content. */
  tone?: 'plain' | 'sunken'
  padded?: boolean
}

export function Card({ tone = 'plain', padded = true, className, ...props }: CardProps) {
  return (
    <div
      {...props}
      className={cx(
        'rounded-lg border',
        tone === 'plain' ? 'border-border bg-surface' : 'border-transparent bg-sunken',
        padded && 'p-4 md:p-5',
        className,
      )}
    />
  )
}

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'error'

const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-sunken text-text-secondary',
  accent: 'bg-accent-subtle text-accent',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  error: 'bg-error-subtle text-error',
}

/** Small status label. Use only for real state (e.g. "Edited", "Failed"), not decoration. */
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
        'inline-flex h-fit self-center items-center rounded-sm px-1.5 py-0.5 font-mono text-2xs uppercase tracking-label',
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        'block animate-pulse rounded-sm bg-sunken motion-reduce:animate-none',
        className,
      )}
    />
  )
}

/** Inline message block for empty, error and info states. Always says what to do next. */
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
        tone === 'error' ? 'border-error' : 'border-border-strong',
        className,
      )}
    >
      <p className="font-medium text-text">{title}</p>
      {children ? (
        <div className="max-w-reading text-sm text-text-secondary">{children}</div>
      ) : null}
      {action}
    </div>
  )
}
