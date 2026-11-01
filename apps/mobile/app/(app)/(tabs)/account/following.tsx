import { nativeTokens as t } from '@dn/design-tokens/native'
import { setFollowMutation } from '@dn/queries'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SettingsPage, settingsStyles as s } from '../../../../components/account/settings'
import { api, queries } from '../../../../lib/api'

export default function FollowingScreen() {
  const router = useRouter()
  const follows = useQuery(queries.follows())
  const followSave = useMutation(setFollowMutation(api, useQueryClient()))
  return (
    <SettingsPage>
      <View style={s.section}>
        <Text style={s.description}>
          Stories from these publishers and narratives rank higher in For You.
        </Text>
        {follows.isPending ? <Text style={s.note}>Loading follows…</Text> : null}
        {follows.isError ? <Text style={s.error}>Your follows could not be loaded.</Text> : null}
        {follows.data?.items.length === 0 ? (
          <Text style={s.note}>Follow publishers or narratives to tune your feed.</Text>
        ) : null}
        {follows.data?.items.map((follow) => (
          <View key={`${follow.targetType}-${follow.id}`} style={styles.row}>
            <Pressable
              accessibilityHint={`Opens this ${follow.targetType}`}
              accessibilityLabel={follow.title}
              accessibilityRole="link"
              onPress={() =>
                router.push(
                  follow.targetType === 'narrative'
                    ? `/narratives/${follow.slug}`
                    : `/publishers/${follow.slug}`,
                )
              }
              style={({ pressed }) => [styles.target, pressed ? s.pressed : null]}
            >
              <Text style={styles.title}>{follow.title}</Text>
              <Text style={styles.kind}>{follow.targetType}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={`Unfollow ${follow.title}`}
              accessibilityRole="button"
              disabled={followSave.isPending}
              onPress={() =>
                followSave.mutate({
                  follow: false,
                  targetId: follow.id,
                  targetType: follow.targetType,
                })
              }
              style={({ pressed }) => [
                styles.action,
                followSave.isPending ? s.disabled : null,
                pressed ? s.pressed : null,
              ]}
            >
              <Text style={styles.actionText}>Unfollow</Text>
            </Pressable>
          </View>
        ))}
        {followSave.isError ? (
          <Text accessibilityLiveRegion="polite" style={s.error}>
            That follow could not be updated. Try again.
          </Text>
        ) : null}
      </View>
    </SettingsPage>
  )
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: t.space[3],
    minHeight: t.size.tap,
  },
  target: { flex: 1, justifyContent: 'center', paddingVertical: t.space[2] },
  title: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
  kind: {
    color: t.color.textMuted,
    fontFamily: t.font.medium,
    fontSize: t.type.meta,
    textTransform: 'capitalize',
  },
  action: { justifyContent: 'center', minHeight: t.size.tap, paddingHorizontal: t.space[2] },
  actionText: { color: t.color.accentText, fontFamily: t.font.bold, fontSize: t.type.meta },
})
