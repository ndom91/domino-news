import { Popover as BasePopover } from '@base-ui/react/popover'
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import type { ReactElement, ReactNode } from 'react'
import { cx } from '../cx.ts'

// Popovers are the only element with a shadow.
const popupBase =
  'origin-(--transform-origin) bg-elevated text-text shadow-popover outline-none transition-[opacity,scale] duration-[var(--dn-duration-fast)] data-starting-style:scale-[0.98] data-starting-style:opacity-0 data-ending-style:scale-[0.98] data-ending-style:opacity-0'

export interface PopoverProps {
  /** Element that opens the popover. Rendered via Base UI so it stays keyboard/touch accessible. */
  trigger: ReactElement
  title?: string
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

/** Click/tap/keyboard popover. Never hover-only, so it works on touch screens. */
export function Popover({ trigger, title, children, side = 'bottom', className }: PopoverProps) {
  return (
    <BasePopover.Root>
      <BasePopover.Trigger render={trigger} />
      <BasePopover.Portal>
        <BasePopover.Positioner side={side} sideOffset={8} collisionPadding={12} className="z-50">
          <BasePopover.Popup
            className={cx(popupBase, 'w-[min(22rem,calc(100vw-1.5rem))] p-4', className)}
          >
            {title ? (
              <BasePopover.Title className="mb-2 type-label">{title}</BasePopover.Title>
            ) : null}
            <BasePopover.Description
              render={<div />}
              className="text-base leading-normal text-text"
            >
              {children}
            </BasePopover.Description>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  )
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <BaseTooltip.Provider delay={350}>{children}</BaseTooltip.Provider>
}

/** Supplementary label only: never put essential information or actions in a tooltip. */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactElement }) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={6} className="z-50">
          <BaseTooltip.Popup className={cx(popupBase, 'max-w-64 px-2 py-1 text-sm')}>
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  )
}
