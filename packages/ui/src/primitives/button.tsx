import { Button as BaseButton } from '@base-ui/react/button'
import type { ComponentProps, ReactNode } from 'react'
import { cx } from '../cx.ts'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const base =
  'inline-flex items-center justify-center gap-2 font-sans font-medium whitespace-nowrap select-none rounded-md border transition-colors duration-[var(--dn-duration-fast)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-disabled:opacity-50 data-disabled:cursor-not-allowed'

const variants: Record<Variant, string> = {
  primary:
    'bg-accent border-accent text-accent-contrast hover:not-data-disabled:bg-accent-hover hover:not-data-disabled:border-accent-hover',
  secondary: 'bg-surface border-border-strong text-text hover:not-data-disabled:bg-sunken',
  ghost:
    'bg-transparent border-transparent text-text-secondary hover:not-data-disabled:bg-sunken hover:not-data-disabled:text-text',
  danger: 'bg-surface border-error text-error hover:not-data-disabled:bg-error-subtle',
}

const sizes: Record<Size, string> = {
  // Both sizes meet the 44px touch target on coarse pointers.
  sm: 'h-8 px-3 text-sm pointer-coarse:min-h-tap',
  md: 'h-10 px-4 text-sm pointer-coarse:min-h-tap',
}

export interface ButtonProps extends Omit<ComponentProps<typeof BaseButton>, 'className'> {
  variant?: Variant
  size?: Size
  loading?: boolean
  className?: string
  children?: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <BaseButton
      {...props}
      disabled={disabled || loading}
      focusableWhenDisabled={loading}
      aria-busy={loading || undefined}
      className={cx(base, variants[variant], sizes[size], className)}
    >
      {loading ? <Spinner /> : null}
      {children}
    </BaseButton>
  )
}

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'size'> {
  /** Accessible name; icon-only buttons must have one. */
  label: string
  icon: ReactNode
}

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  className,
  ...props
}: IconButtonProps) {
  return (
    <Button
      {...props}
      variant={variant}
      aria-label={label}
      title={label}
      className={cx('size-10 px-0 pointer-coarse:size-tap', className)}
    >
      {icon}
    </Button>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
    />
  )
}
