import { setFollowMutation } from '@dn/queries'
import type { FollowTargetType } from '@dn/schemas'
import { Button } from '@dn/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, queries } from '../lib/api.ts'

/** Follow a narrative or publisher. Followed items rank first on For You. */
export function FollowButton({
  targetType,
  targetId,
  name,
}: {
  targetType: FollowTargetType
  targetId: string
  name: string
}) {
  const queryClient = useQueryClient()
  const follows = useQuery(queries.follows())
  const save = useMutation(setFollowMutation(api, queryClient))
  const following =
    follows.data?.items.some((f) => f.targetType === targetType && f.id === targetId) ?? false
  return (
    <Button
      size="sm"
      variant={following ? 'ghost' : 'primary'}
      aria-pressed={following}
      aria-label={following ? `Unfollow ${name}` : `Follow ${name}`}
      disabled={follows.isPending}
      loading={save.isPending}
      onClick={() => save.mutate({ targetType, targetId, follow: !following })}
    >
      {following ? 'Following' : 'Follow'}
    </Button>
  )
}
