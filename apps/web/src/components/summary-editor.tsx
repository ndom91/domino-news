import { ApiError } from '@dn/api-client'
import { editSummaryMutation } from '@dn/queries'
import type { Summary } from '@dn/schemas'
import { Button, Notice, Textarea, TextInput } from '@dn/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { api } from '../lib/api.ts'

/** Dev-only editor. Saving creates a new summary version; the previous one stays in history. */
export function SummaryEditor({
  storyId,
  summary,
  onDone,
}: {
  storyId: string
  summary: Summary
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const mutation = useMutation(editSummaryMutation(api, queryClient, storyId))

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    mutation.mutate(
      {
        headline: String(form.get('headline') ?? ''),
        body: String(form.get('body') ?? ''),
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
      className="flex flex-col gap-4 border-2 border-rule bg-canvas p-4 md:p-5"
    >
      <TextInput
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
        description="Saving creates a new version. The current version stays in the history."
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
        <Button type="button" variant="ghost" onClick={onDone} disabled={mutation.isPending}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
