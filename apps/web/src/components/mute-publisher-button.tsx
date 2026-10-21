import { setMutedPublisherMutation } from '@dn/queries'
import { Button } from '@dn/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, queries } from '../lib/api.ts'

/** Removes one publisher from this reader's personalised Briefing, never from shared Stories. */
export function MutePublisherButton({ publisherId, name }: { publisherId: string; name: string }) {
  const queryClient = useQueryClient()
  const muted = useQuery(queries.mutedPublishers())
  const save = useMutation(setMutedPublisherMutation(api, queryClient))
  const isMuted = muted.data?.items.some((publisher) => publisher.id === publisherId) ?? false
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-pressed={isMuted}
      aria-label={isMuted ? `Unmute ${name}` : `Mute ${name} in Briefing`}
      disabled={muted.isPending}
      loading={save.isPending}
      onClick={() => save.mutate({ publisherId, muted: !isMuted })}
    >
      {isMuted ? 'Muted' : 'Mute'}
    </Button>
  )
}
