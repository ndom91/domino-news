import { AlertDialog as BaseAlertDialog } from '@base-ui/react/alert-dialog'
import { Menu as BaseMenu } from '@base-ui/react/menu'
import { Popover as BasePopover } from '@base-ui/react/popover'
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { type ReactElement, type ReactNode, useRef, useState } from 'react'
import { cx } from '../cx.ts'
import { Button } from './button.tsx'

// Popovers are the only element with a shadow. Motion comes from the t-* class each adds.
const popupBase = 'bg-elevated text-text shadow-popover outline-none'

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
            className={cx(popupBase, 't-popup w-[min(22rem,calc(100vw-1.5rem))] p-4', className)}
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

const menuItemBase =
  'flex min-h-tap w-full cursor-pointer items-center px-4 text-base font-semibold outline-none select-none data-highlighted:text-canvas'
// aria-current marks the current page in a navigation menu, as in the header nav.
const menuItemClass = `${menuItemBase} data-highlighted:bg-text aria-[current=page]:bg-accent aria-[current=page]:text-accent-contrast`
// Matches the danger Button. Separate strings: two highlight fills on one element would
// leave the winner to CSS order.
const dangerItemClass = `${menuItemBase} text-error data-highlighted:bg-error`

/** Click/keyboard menu of actions, anchored to its trigger. Arrow keys move between items. */
export function Menu({ trigger, children }: { trigger: ReactElement; children: ReactNode }) {
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger render={trigger} />
      <BaseMenu.Portal>
        <BaseMenu.Positioner align="end" sideOffset={8} collisionPadding={12} className="z-50">
          <BaseMenu.Popup className={cx(popupBase, 't-popup min-w-44 border-2 border-rule py-1')}>
            {children}
          </BaseMenu.Popup>
        </BaseMenu.Positioner>
      </BaseMenu.Portal>
    </BaseMenu.Root>
  )
}

export function MenuItem({
  children,
  onClick,
  closeOnClick = true,
  tone,
  'aria-label': ariaLabel,
}: {
  children: ReactNode
  onClick: () => void
  /** Styled like the danger Button, e.g. Sign out. */
  tone?: 'danger'
  /** false for toggles, so the new state stays visible. */
  closeOnClick?: boolean
  'aria-label'?: string
}) {
  return (
    <BaseMenu.Item
      className={tone === 'danger' ? dangerItemClass : menuItemClass}
      onClick={onClick}
      closeOnClick={closeOnClick}
      aria-label={ariaLabel}
    >
      {children}
    </BaseMenu.Item>
  )
}

/** Menu entry that navigates. `render` is the router's link, e.g. <Link to="/account" />. */
export function MenuLinkItem({ children, render }: { children: ReactNode; render: ReactElement }) {
  return (
    // Link items stay open by default; close so the menu is gone after navigating.
    <BaseMenu.LinkItem className={menuItemClass} render={render} closeOnClick>
      {children}
    </BaseMenu.LinkItem>
  )
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <BaseTooltip.Provider delay={350}>{children}</BaseTooltip.Provider>
}

/** Supplementary label only: never put essential information or actions in a tooltip. */
export function Tooltip({
  content,
  delay,
  children,
}: {
  content: ReactNode
  /** Open delay in ms; defaults to the provider's. */
  delay?: number
  children: ReactElement
}) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger delay={delay} render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner sideOffset={6} className="z-50">
          <BaseTooltip.Popup className={cx(popupBase, 't-tooltip max-w-64 px-2 py-1 text-sm')}>
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  )
}

export interface ConfirmDialogProps {
  /** Element that opens the dialog. Omit it and pass `open` to control the dialog yourself. */
  trigger?: ReactElement
  open?: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  /** Called on Cancel, Escape or any other dismissal. */
  onCancel?: () => void
}

/** Asks before an action that is hard to undo. Focus starts on Cancel, the safe choice. */
export function ConfirmDialog({
  trigger,
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [triggeredOpen, setTriggeredOpen] = useState(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <BaseAlertDialog.Root
      open={open ?? triggeredOpen}
      onOpenChange={(next) => {
        setTriggeredOpen(next)
        if (!next) onCancel?.()
      }}
    >
      {trigger ? <BaseAlertDialog.Trigger render={trigger} /> : null}
      <BaseAlertDialog.Portal>
        <BaseAlertDialog.Backdrop className="fixed inset-0 z-50 bg-scrim transition-opacity duration-(--dn-duration-enter) data-ending-style:duration-(--dn-duration-exit) data-starting-style:opacity-0 data-ending-style:opacity-0" />
        <BaseAlertDialog.Popup
          initialFocus={cancelRef}
          className={cx(
            popupBase,
            't-modal fixed top-1/2 left-1/2 z-50 w-[min(26rem,calc(100vw-1.5rem))] -translate-1/2 p-5',
          )}
        >
          <BaseAlertDialog.Title className="text-md font-bold">{title}</BaseAlertDialog.Title>
          {children ? (
            <BaseAlertDialog.Description
              render={<div />}
              className="mt-2 text-base leading-normal text-text-secondary"
            >
              {children}
            </BaseAlertDialog.Description>
          ) : null}
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <BaseAlertDialog.Close render={<Button ref={cancelRef} size="sm" variant="ghost" />}>
              {cancelLabel}
            </BaseAlertDialog.Close>
            {/* Not a Close: closing that way would also report a cancel. */}
            <Button
              size="sm"
              variant={destructive ? 'danger' : 'primary'}
              onClick={() => {
                setTriggeredOpen(false)
                onConfirm()
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </BaseAlertDialog.Popup>
      </BaseAlertDialog.Portal>
    </BaseAlertDialog.Root>
  )
}
