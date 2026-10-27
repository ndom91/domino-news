import { Radio } from '@base-ui/react/radio'
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group'
import { useId } from 'react'

export interface RadioOption<T extends string> {
  value: T
  label: string
  description?: string
  disabled?: boolean
}

export interface RadioGroupProps<T extends string> {
  options: readonly RadioOption<T>[]
  label: string
  name?: string
  value?: T
  defaultValue?: T
  onValueChange?: (value: T) => void
  disabled?: boolean
}

export function RadioGroup<T extends string>({
  options,
  label,
  name,
  value,
  defaultValue,
  onValueChange,
  disabled,
}: RadioGroupProps<T>) {
  const id = useId()
  return (
    <BaseRadioGroup
      aria-label={label}
      name={name}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
      className="flex flex-col gap-3"
    >
      {options.map((option, index) => (
        <label
          key={option.value}
          htmlFor={`${id}-${index}`}
          className="flex min-h-tap cursor-pointer items-start gap-3"
        >
          <Radio.Root
            id={`${id}-${index}`}
            value={option.value}
            disabled={option.disabled}
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-text bg-canvas data-checked:border-accent data-disabled:cursor-not-allowed data-disabled:opacity-40"
          >
            <Radio.Indicator className="size-2.5 rounded-full bg-accent" />
          </Radio.Root>
          <span>
            <span className="block font-semibold">{option.label}</span>
            {option.description ? (
              <span className="text-sm text-text-secondary">{option.description}</span>
            ) : null}
          </span>
        </label>
      ))}
    </BaseRadioGroup>
  )
}
