import { Select as BaseSelect } from '@base-ui/react/select'
import { useId } from 'react'
import { cx } from '../cx.ts'
import { menuItemBase, menuItemHighlight, popupBase } from './overlay.tsx'

export interface SelectOption<T extends string> {
  /** null is the "no filter / no preference" choice; it submits as an empty string. */
  value: T | null
  label: string
}

export interface SelectProps<T extends string> {
  options: readonly SelectOption<T>[]
  /** Controlled value. Use `defaultValue` instead inside uncontrolled forms. */
  value?: T | null
  defaultValue?: T | null
  onValueChange?: (value: T | null) => void
  /** Form field name, for forms read with FormData. */
  name?: string
  /** Visible label above the select, as on TextInput. */
  label?: string
  /** Without `label`: pair with a <label htmlFor>, or pass aria-label. */
  id?: string
  'aria-label'?: string
  disabled?: boolean
  className?: string
}

/**
 * Square select in the house style: a bordered trigger and a token-styled list, replacing the
 * platform <select>. Keyboard: arrows/typeahead to move, Enter to pick, Escape to close.
 */
export function Select<T extends string>({
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  label,
  id,
  'aria-label': ariaLabel,
  disabled,
  className,
}: SelectProps<T>) {
  const labelId = useId()
  const select = (
    <BaseSelect.Root
      items={options}
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => onValueChange?.(next as T | null)}
      name={name}
      id={label ? labelId : id}
      disabled={disabled}
    >
      <BaseSelect.Trigger
        aria-label={ariaLabel}
        className={cx(
          'inline-flex min-h-10 min-w-0 cursor-pointer items-center justify-between gap-3 border-2 border-text bg-canvas px-2.5 text-label font-semibold text-text select-none hover:bg-sunken data-disabled:cursor-not-allowed data-disabled:opacity-40 data-popup-open:bg-sunken',
          className,
        )}
      >
        <BaseSelect.Value className="truncate" />
        <BaseSelect.Icon className="flex-none transition-transform duration-(--dn-duration-fast) data-popup-open:rotate-180">
          <svg aria-hidden width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="2" />
          </svg>
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} align="start" alignItemWithTrigger={false}>
          <BaseSelect.Popup
            className={cx(
              popupBase,
              'max-h-(--available-height) min-w-(--anchor-width) t-popup overflow-y-auto overscroll-contain py-1',
            )}
          >
            {options.map((option) => (
              <BaseSelect.Item
                key={option.value ?? ''}
                value={option.value}
                className={cx(menuItemBase, menuItemHighlight, 'justify-between gap-6')}
              >
                <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                <BaseSelect.ItemIndicator>
                  <svg aria-hidden width="12" height="10" viewBox="0 0 12 10" fill="none">
                    <path d="M1 5l3.5 3.5L11 1.5" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </BaseSelect.ItemIndicator>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  )
  if (!label) return select
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={labelId} className="type-label">
        {label}
      </label>
      {select}
    </div>
  )
}
