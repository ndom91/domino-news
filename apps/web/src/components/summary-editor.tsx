import { ApiError } from '@dn/api-client'
import { editSummaryMutation } from '@dn/queries'
import type { Summary } from '@dn/schemas'
import { Button, ConfirmDialog, Notice, Textarea, TextInput } from '@dn/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useBlocker } from '@tanstack/react-router'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.ts'

const discard = {
  title: 'Discard your changes?',
  children: 'Your edits to this summary have not been saved.',
  confirmLabel: 'Discard changes',
  cancelLabel: 'Keep editing',
  destructive: true,
}

/** Dev-only editor. Saving creates a new summary version; the previous one stays in history. */
export function SummaryEditor({
  storyId,
  summary: initialSummary,
  onDone,
}: {
  storyId: string
  summary: Summary
  onDone: () => void
}) {
  // Keep the edit based on the version that populated the form, even if the story refetches.
  const [summary] = useState(initialSummary)
  const queryClient = useQueryClient()
  const mutation = useMutation(editSummaryMutation(api, queryClient, storyId))
  const [dirty, setDirty] = useState(false)
  // Guards in-app navigation and closing the tab while there are unsaved edits.
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  })
  const headlineRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    headlineRef.current?.focus()
  }, [])

  function onChange(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget)
    setDirty(
      form.get('headline') !== summary.headline ||
        form.get('body') !== summary.body ||
        form.get('detail') !== (summary.detail ?? ''),
    )
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    mutation.mutate(
      {
        headline: String(form.get('headline') ?? ''),
        body: String(form.get('body') ?? ''),
        detail: String(form.get('detail') ?? ''),
        basedOnVersionId: summary.versionId,
      },
      { onSuccess: onDone },
    )
  }

  const error =
    mutation.error instanceof ApiError && mutation.error.code === 'conflict'
      ? 'Someone changed this summary while you were editing. Reload to see the latest version, then edit again.'
      : mutation.error
        ? mutation.error.message
        : null

  return (
    <form
      onSubmit={onSubmit}
      onChange={onChange}
      className="flex flex-col gap-4 border-2 border-rule bg-canvas p-4 md:p-5"
    >
      <TextInput
        ref={headlineRef}
        label="Headline"
        name="headline"
        defaultValue={summary.headline}
        required
        maxLength={200}
      />
      <Textarea
        label="Summary"
        name="body"
        rows={6}
        defaultValue={summary.body}
        required
        maxLength={4000}
      />
      <Textarea
        label="More detail"
        name="detail"
        rows={10}
        defaultValue={summary.detail ?? ''}
        maxLength={8000}
        description="Shown below the summary on the story page. Separate paragraphs with a blank line. Saving creates a new version. The current version stays in the history."
      />
      {error ? (
        <Notice tone="error" title="Summary not saved">
          {error}
        </Notice>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" loading={mutation.isPending}>
          Save new version
        </Button>
        {dirty ? (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="ghost" disabled={mutation.isPending}>
                Cancel
              </Button>
            }
            {...discard}
            onConfirm={onDone}
          />
        ) : (
          <Button type="button" variant="ghost" onClick={onDone} disabled={mutation.isPending}>
            Cancel
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={blocker.status === 'blocked'}
        {...discard}
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </form>
  )
}
