import { nativeTokens as t } from '@dn/design-tokens/native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { authClient } from '../../lib/auth-client'
import { forgetForYouAlerts } from '../../lib/for-you-alerts'
import { Button } from '../ui'
import { ConfirmationDialog } from './confirmation-dialog'

/**
 * Self-serve account deletion, as on the web Account page. better-auth wants the password, or
 * for accounts without one (Google) a session under a day old; otherwise the reader signs in again.
 */
export function DeleteAccount() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState('')
  const accounts = useQuery({
    queryKey: ['account', 'linked'],
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts()
      if (error) throw new Error(error.message ?? 'Could not load your sign-in methods.')
      return data ?? []
    },
  })
  const hasPassword = accounts.data?.some((a) => a.providerId === 'credential') ?? false
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.deleteUser(hasPassword ? { password } : {})
      if (error) {
        if (error.code === 'SESSION_EXPIRED')
          throw new Error('For your security, sign out, sign in again, then delete your account.')
        throw new Error(error.message ?? 'Your account was not deleted. Try again.')
      }
    },
    onSuccess: async () => {
      setConfirming(false)
      // The server removed the push subscription with the account; forget the local opt-in too.
      await forgetForYouAlerts().catch(() => {})
      queryClient.clear()
      router.replace('/sign-in')
    },
    onSettled: () => setPassword(''),
  })

  function cancel() {
    setConfirming(false)
    setPassword('')
  }

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Delete account</Text>
      <Text style={styles.description}>
        Deleting your account removes your preferences, follows, reading history and feedback. It
        can’t be undone.
      </Text>
      {accounts.isError ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {accounts.error.message}
        </Text>
      ) : null}
      {remove.isError && !confirming ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {remove.error.message}
        </Text>
      ) : null}
      <Button
        disabled={accounts.isPending || accounts.isError || remove.isPending}
        onPress={() => {
          remove.reset()
          setConfirming(true)
        }}
        tone="light"
      >
        {remove.isPending ? 'Deleting account…' : 'Delete account'}
      </Button>
      <ConfirmationDialog
        cancelLabel="Keep account"
        confirmLabel={remove.isPending ? 'Deleting…' : 'Delete account'}
        detail="Everything tied to your account is deleted straight away. This can’t be undone."
        onCancel={cancel}
        onConfirm={() => remove.mutate()}
        pending={remove.isPending || (hasPassword && password.length === 0)}
        title="Delete your account?"
        visible={confirming}
      >
        {hasPassword ? (
          <View style={styles.field}>
            <Text style={styles.label}>Your password</Text>
            <TextInput
              accessibilityLabel="Your password"
              autoComplete="current-password"
              editable={!remove.isPending}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={t.color.textMuted}
              secureTextEntry
              style={styles.input}
              value={password}
            />
          </View>
        ) : null}
        {remove.isError ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {remove.error.message}
          </Text>
        ) : null}
      </ConfirmationDialog>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: t.space[4], marginTop: t.space[8] },
  title: { color: t.color.text, fontFamily: t.font.black, fontSize: t.type.headline },
  description: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
  },
  field: { gap: t.space[2] },
  label: { color: t.color.textSecondary, fontFamily: t.font.bold, fontSize: t.type.label },
  input: {
    backgroundColor: t.color.surface,
    borderColor: t.color.borderStrong,
    borderWidth: 1,
    color: t.color.text,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    minHeight: t.size.tap,
    paddingHorizontal: t.space[3],
  },
  error: { color: t.color.error, fontFamily: t.font.medium, fontSize: t.type.body, lineHeight: 22 },
})
