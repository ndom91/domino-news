import { savePreferencesMutation } from '@dn/queries'
import { Button, ConfirmDialog, Notice } from '@dn/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, queries } from '../lib/api.ts'

/**
 * Opt-in switch for reading history (off by default). Turning it off deletes the history,
 * so that path asks first. Used on /account and on the Blindspot page.
 */
export function ReadingHistoryToggle() {
  const queryClient = useQueryClient()
  const prefs = useQuery(queries.preferences())
  const save = useMutation(savePreferencesMutation(api, queryClient))
  const on = prefs.data?.rememberReads ?? false

  return (
    <div>
      <p className="mb-4 max-w-reading text-sm text-text-secondary">
        {on
          ? 'Domino remembers which stories you open for 30 days, to show what you missed and what you rarely read. It never guesses your politics.'
          : 'Off. Turn it on to see what you missed in stories you follow and which regions and topics you rarely read. Stories you open are kept for 30 days.'}
      </p>
      {on ? (
        <ConfirmDialog
          trigger={
            <Button variant="danger" loading={save.isPending}>
              Turn off and delete history
            </Button>
          }
          title="Turn off reading history?"
          confirmLabel="Turn off and delete"
          destructive
          onConfirm={() => save.mutate({ rememberReads: false })}
        >
          Your reading history is deleted straight away. You can turn it on again later.
        </ConfirmDialog>
      ) : (
        <Button
          variant="primary"
          disabled={prefs.isPending}
          loading={save.isPending}
          onClick={() => save.mutate({ rememberReads: true })}
        >
          Remember what I read
        </Button>
      )}
      {save.isError ? (
        <Notice tone="error" title="Setting not saved" className="mt-4">
          {save.error.message}
        </Notice>
      ) : null}
    </div>
  )
}
