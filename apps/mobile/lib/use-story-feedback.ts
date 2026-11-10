import { feedbackMutation } from '@dn/queries'
import type { FeedbackSignal } from '@dn/schemas'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from './api'

/**
 * "More / less like this" on a feed card. "Less" hides the card and Undo shows it again: the
 * feed isn't refetched after feedback (see feedbackMutation), so the card owns that state.
 */
export function useStoryFeedback(storyId: string, initial: FeedbackSignal | null) {
  const queryClient = useQueryClient()
  const save = useMutation(feedbackMutation(api, queryClient))
  const [signal, setSignal] = useState(initial)
  const [hidden, setHidden] = useState(false)

  function update(next: FeedbackSignal | null) {
    const previous = signal
    setSignal(next)
    setHidden(next === 'less')
    save.mutate(
      { storyId, signal: next },
      {
        onError: () => {
          setSignal(previous)
          setHidden(false)
        },
      },
    )
  }

  return { signal, hidden, update, isPending: save.isPending, isError: save.isError }
}
