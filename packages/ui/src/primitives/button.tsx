import { Button as BaseButton } from '@base-ui/react/button'
import type { ComponentProps, ReactNode } from 'react'
import { cx } from '../cx.ts'
import { Tooltip } from './overlay.tsx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

// Square. Primary = ink fill, secondary = 2px ink border; hover inverts. Orange is never a button colour.
const base =
  'inline-flex cursor-pointer items-center justify-center gap-2 border-2 font-semibold whitespace-nowrap select-none transition-colors duration-(--dn-duration-fast) data-disabled:cursor-not-allowed data-disabled:opacity-40'

const variants: Record<Variant, string> = {
  primary:
    'border-text bg-text text-canvas hover:not-data-disabled:bg-canvas hover:not-data-disabled:text-text',
  secondary:
    'border-text bg-transparent text-text hover:not-data-disabled:bg-text hover:not-data-disabled:text-canvas',
  ghost: 'border-transparent bg-transparent text-text hover:not-data-disabled:border-text',
  danger:
    'border-error bg-transparent text-error hover:not-data-disabled:bg-error hover:not-data-disabled:text-canvas',
}

const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-sm pointer-coarse:min-h-tap',
  md: 'min-h-tap px-4 text-base',
}

export interface ButtonProps extends Omit<ComponentProps<typeof BaseButton>, 'className'> {
  variant?: Variant
  size?: Size
  /** Keeps the label and appends "…" while busy; a text label shimmers. No spinner. */
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
      {loading && typeof children === 'string' ? (
        <span className="t-shimmer" data-text={children}>
          {children}
        </span>
      ) : (
        children
      )}
      {loading ? <span aria-hidden>…</span> : null}
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
    <Tooltip content={label}>
      <Button
        {...props}
        variant={variant}
        aria-label={label}
        // px-0 overrides the size's px-4 (cx resolves the conflict); shrink-0 keeps the
        // icon its own size inside the flex button.
        className={cx('size-tap px-0 [&_svg]:shrink-0', className)}
      >
        {icon}
      </Button>
    </Tooltip>
  )
}
