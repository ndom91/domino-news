import { nativeTokens as t } from '@dn/design-tokens/native'
import { Redirect, Stack } from 'expo-router'
import { StyleSheet } from 'react-native'
import { LoadingView, Screen } from '../../components/ui'
import { authClient } from '../../lib/auth-client'

export default function SignedInLayout() {
  const session = authClient.useSession()
  if (session.isPending) {
    return (
      <Screen>
        <LoadingView label="Restoring your session" />
      </Screen>
    )
  }
  if (!session.data) return <Redirect href="/sign-in" />

  return (
    <Stack screenOptions={{ contentStyle: styles.screen, headerTintColor: t.color.text }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="stories/[slug]"
        options={{ headerBackTitle: 'Back', headerTitle: 'Story' }}
      />
    </Stack>
  )
}

const styles = StyleSheet.create({ screen: { backgroundColor: t.color.canvas } })
