import { Tabs as BaseTabs } from '@base-ui/react/tabs'
import type { ReactNode } from 'react'
import { cx } from '../cx.ts'

export interface TabItem<T extends string> {
  value: T
  label: string
  content: ReactNode
}

export interface TabsProps<T extends string> {
  tabs: readonly TabItem<T>[]
  /** Controlled: keep the value in the URL and update it in `onValueChange`. */
  value: T
  onValueChange: (value: T) => void
  /** Names the tab list for screen readers. */
  'aria-label': string
  className?: string
}

/**
 * Underlined tabs in the section-label style: the active tab carries the accent rule. Arrow
 * keys move between tabs; only the active panel is rendered.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onValueChange,
  'aria-label': ariaLabel,
  className,
}: TabsProps<T>) {
  return (
    <BaseTabs.Root
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      className={className}
    >
      <BaseTabs.List
        aria-label={ariaLabel}
        className="flex gap-6 overflow-x-auto border-b border-border"
      >
        {tabs.map((t) => (
          <BaseTabs.Tab
            key={t.value}
            value={t.value}
            className={cx(
              'min-h-tap shrink-0 cursor-pointer border-b-4 border-transparent type-label whitespace-nowrap text-text-muted transition-colors duration-(--dn-duration-fast)',
              'hover:text-text data-active:border-accent data-active:text-text',
            )}
          >
            {t.label}
          </BaseTabs.Tab>
        ))}
      </BaseTabs.List>
      {tabs.map((t) => (
        <BaseTabs.Panel key={t.value} value={t.value} className="pt-8">
          {t.content}
        </BaseTabs.Panel>
      ))}
    </BaseTabs.Root>
  )
}
