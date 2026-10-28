import { Toast as BaseToast } from '@base-ui/react/toast'
import type { ReactNode } from 'react'

/** Use inside ToastProvider: `toast.add({ title: 'Saved', type: 'success' })`. */
export const useToast = BaseToast.useToastManager

export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <BaseToast.Provider>
      {children}
      <ToastViewport />
    </BaseToast.Provider>
  )
}

function ToastViewport() {
  const { toasts } = useToast()
  return (
    <BaseToast.Portal>
      <BaseToast.Viewport className="dn-toast-viewport">
        {toasts.map((toast) => (
          <BaseToast.Root
            key={toast.id}
            toast={toast}
            className="dn-toast border-2 border-rule bg-elevated text-text data-[type=error]:border-error"
          >
            <BaseToast.Content className="dn-toast-content flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                {toast.title ? <BaseToast.Title className="text-sm font-bold" /> : null}
                {toast.description ? (
                  <BaseToast.Description className="text-sm text-text-secondary" />
                ) : null}
                {toast.actionProps ? (
                  <BaseToast.Action className="link-inline mt-1 min-h-tap text-sm font-semibold" />
                ) : null}
              </div>
              <BaseToast.Close className="min-h-tap shrink-0 px-2 text-sm font-semibold underline underline-offset-3">
                Dismiss
              </BaseToast.Close>
            </BaseToast.Content>
          </BaseToast.Root>
        ))}
      </BaseToast.Viewport>
    </BaseToast.Portal>
  )
}
