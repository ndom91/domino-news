import { Button, ToastProvider, useToast } from '@dn/ui'

export function ToastDemo() {
  return (
    <ToastProvider>
      <ToastDemoButtons />
    </ToastProvider>
  )
}

function ToastDemoButtons() {
  const toast = useToast()
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        onClick={() => toast.add({ title: 'Preferences saved', type: 'success', timeout: 0 })}
      >
        Show success
      </Button>
      <Button
        onClick={() =>
          toast.add({
            title: 'Preferences not saved',
            description: 'Try again.',
            type: 'error',
            priority: 'high',
            timeout: 0,
          })
        }
      >
        Show error
      </Button>
    </div>
  )
}
