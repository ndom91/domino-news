import { nativeTokens as t } from '@dn/design-tokens/native'
import { setMutedPublisherMutation } from '@dn/queries'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { StyleSheet, Text, View } from 'react-native'
import { api, queries } from '../../lib/api'
import { Button, uiStyles } from '../ui'

export function MutePublisher({ id, name }: { id: string; name: string }) {
  const list = useQuery(queries.mutedPublishers())
  const save = useMutation(setMutedPublisherMutation(api, useQueryClient()))
  const muted = list.data?.items.some((item) => item.id === id) ?? false
  return (
    <View style={styles.section}>
      <Button
        disabled={!list.data || save.isPending}
        tone="light"
        onPress={() => save.mutate({ publisherId: id, muted: !muted })}
      >
        {muted ? `Unmute ${name}` : `Mute ${name}`}
      </Button>
      <Text style={styles.text}>
        Muted publishers do not shape your Briefing. Stories can still appear when other publishers
        report them.
      </Text>
      {list.isError || save.isError ? (
        <Text style={styles.error}>Could not update muted publishers. Try again.</Text>
      ) : null}
      {list.isError ? (
        <Button tone="light" onPress={() => void list.refetch()}>
          Retry loading muted publishers
        </Button>
      ) : null}
    </View>
  )
}
export function MutedPublishers() {
  const list = useQuery(queries.mutedPublishers())
  const save = useMutation(setMutedPublisherMutation(api, useQueryClient()))
  return (
    <View style={styles.list}>
      <Text style={uiStyles.label}>Muted publishers</Text>
      {list.isPending ? <Text style={styles.text}>Loading…</Text> : null}
      {list.isError || save.isError ? (
        <Text style={styles.error}>Could not update muted publishers. Try again.</Text>
      ) : null}
      {list.isError ? (
        <Button tone="light" onPress={() => void list.refetch()}>
          Retry loading muted publishers
        </Button>
      ) : null}
      {list.data?.items.length === 0 ? <Text style={styles.text}>No muted publishers.</Text> : null}
      {list.data?.items.map((item) => (
        <Button
          key={item.id}
          tone="light"
          disabled={save.isPending}
          onPress={() => save.mutate({ publisherId: item.id, muted: false })}
        >{`Unmute ${item.name}`}</Button>
      ))}
    </View>
  )
}
const styles = StyleSheet.create({
  section: { gap: t.space[3], marginTop: t.space[5] },
  list: { gap: t.space[3] },
  text: { color: t.color.textSecondary, fontFamily: t.font.regular, fontSize: t.type.body },
  error: { color: t.color.error },
})
