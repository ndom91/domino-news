import { nativeTokens as t } from '@dn/design-tokens/native'
import { setFollowMutation } from '@dn/queries'
import type { FollowTargetType } from '@dn/schemas'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pressable, StyleSheet, Text } from 'react-native'
import { api, queries } from '../lib/api'

/** Followed publishers and narratives are ranked higher in the For You feed. */
export function FollowToggle({
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
    follows.data?.items.some(
      (follow) => follow.targetType === targetType && follow.id === targetId,
    ) ?? false
  const disabled = follows.isPending || follows.isError || save.isPending

  return (
    <Pressable
      accessibilityLabel={following ? `Unfollow ${name}` : `Follow ${name}`}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: following }}
      disabled={disabled}
      onPress={() => save.mutate({ targetType, targetId, follow: !following })}
      style={({ pressed }) => [
        styles.button,
        following ? styles.following : styles.follow,
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
      ]}
    >
      <Text style={[styles.text, following ? styles.followingText : styles.followText]}>
        {save.isPending ? 'Saving...' : following ? 'Following' : 'Follow'}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: t.size.tap,
    paddingHorizontal: t.space[4],
  },
  follow: { backgroundColor: t.color.band },
  following: { backgroundColor: t.color.surface, borderColor: t.color.rule, borderWidth: 1 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
  text: { fontFamily: t.font.bold, fontSize: t.type.body },
  followText: { color: t.color.bandText },
  followingText: { color: t.color.text },
})
