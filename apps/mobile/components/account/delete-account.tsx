import { nativeTokens as t } from '@dn/design-tokens/native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text } from 'react-native'
import { authClient } from '../../lib/auth-client'
import { forgetForYouAlerts } from '../../lib/for-you-alerts'
import { TextField } from '../ui'
import { ConfirmationDialog } from './confirmation-dialog'
import { SettingsRow } from './settings'

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

  const error = accounts.isError
    ? accounts.error.message
    : remove.isError && !confirming
      ? remove.error.message
      : null

  return (
    <>
      <SettingsRow
        destructive
        disabled={accounts.isPending || accounts.isError || remove.isPending}
        icon="trash-2"
        kind="action"
        onPress={() => {
          remove.reset()
          setConfirming(true)
        }}
        title={remove.isPending ? 'Deleting account…' : 'Delete account'}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.error, styles.rowError]}>
          {error}
        </Text>
      ) : null}
      <ConfirmationDialog
        cancelLabel="Keep account"
        confirmLabel={remove.isPending ? 'Deleting…' : 'Delete account'}
        detail="Your preferences, follows, reading history and feedback are deleted straight away. This can’t be undone."
        onCancel={cancel}
        onConfirm={() => remove.mutate()}
        pending={remove.isPending || (hasPassword && password.length === 0)}
        title="Delete your account?"
        visible={confirming}
      >
        {hasPassword ? (
          <TextField
            autoComplete="current-password"
            editable={!remove.isPending}
            label="Your password"
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            value={password}
          />
        ) : null}
        {remove.isError ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {remove.error.message}
          </Text>
        ) : null}
      </ConfirmationDialog>
    </>
  )
}

const styles = StyleSheet.create({
  error: { color: t.color.error, fontFamily: t.font.medium, fontSize: t.type.body, lineHeight: 22 },
  rowError: { paddingHorizontal: t.space[4], paddingVertical: t.space[3] },
})
