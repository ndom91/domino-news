import { Field } from '@base-ui/react/field'
import { Input } from '@base-ui/react/input'
import type { ComponentProps, ReactNode } from 'react'
import { cx } from '../cx.ts'

// Square inputs with a 2px ink border; errors switch the border and show a message.
const control =
  'w-full border-2 border-text bg-surface px-3 text-base text-text placeholder:text-text-muted outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus data-invalid:border-error data-disabled:opacity-40'

interface FieldShellProps {
  label?: string
  /** Visually hide the label but keep it for assistive tech. */
  hideLabel?: boolean
  description?: string
  error?: string | null
  className?: string
  children: ReactNode
}

function FieldShell({
  label,
  hideLabel,
  description,
  error,
  className,
  children,
}: FieldShellProps) {
  return (
    <Field.Root invalid={Boolean(error)} className={cx('flex flex-col gap-1.5', className)}>
      {label ? (
        <Field.Label className={cx('type-label', hideLabel && 'sr-only')}>{label}</Field.Label>
      ) : null}
      {children}
      {description && !error ? (
        <Field.Description className="type-meta">{description}</Field.Description>
      ) : null}
      {error ? (
        <Field.Error match className="text-sm font-semibold text-error">
          {error}
        </Field.Error>
      ) : null}
    </Field.Root>
  )
}

export interface TextInputProps extends Omit<ComponentProps<typeof Input>, 'className'> {
  label?: string
  hideLabel?: boolean
  description?: string
  error?: string | null
  className?: string
  inputClassName?: string
  leading?: ReactNode
}

export function TextInput({
  label,
  hideLabel,
  description,
  error,
  className,
  inputClassName,
  leading,
  ...props
}: TextInputProps) {
  return (
    <FieldShell
      label={label}
      hideLabel={hideLabel}
      description={description}
      error={error}
      className={className}
    >
      <div className="relative">
        {leading ? (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-text-muted">
            {leading}
          </span>
        ) : null}
        <Input
          {...props}
          className={cx(control, 'min-h-tap', leading ? 'pl-9' : null, inputClassName)}
        />
      </div>
    </FieldShell>
  )
}

export interface TextareaProps extends Omit<ComponentProps<'textarea'>, 'className'> {
  label?: string
  hideLabel?: boolean
  description?: string
  error?: string | null
  className?: string
}

export function Textarea({
  label,
  hideLabel,
  description,
  error,
  className,
  rows = 4,
  ...props
}: TextareaProps) {
  return (
    <FieldShell
      label={label}
      hideLabel={hideLabel}
      description={description}
      error={error}
      className={className}
    >
      <Field.Control
        render={<textarea rows={rows} {...props} />}
        className={cx(control, 'min-h-24 resize-y py-2 leading-normal')}
      />
    </FieldShell>
  )
}
