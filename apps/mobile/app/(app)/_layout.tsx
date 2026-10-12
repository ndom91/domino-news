import { nativeTokens as t } from '@dn/design-tokens/native'
import * as Notifications from 'expo-notifications'
import { Redirect, Stack, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import { LoadingView, Screen } from '../../components/ui'
import { authClient } from '../../lib/auth-client'

export default function SignedInLayout() {
  const session = authClient.useSession()
  const router = useRouter()

  useEffect(() => {
    if (!session.data) return

    const openStory = (response: Notifications.NotificationResponse | null) => {
      const storySlug = response?.notification.request.content.data?.storySlug
      if (typeof storySlug === 'string') {
        router.push({ pathname: '/stories/[slug]', params: { slug: storySlug } })
      }
    }
    void Notifications.getLastNotificationResponseAsync().then(openStory)
    const subscription = Notifications.addNotificationResponseReceivedListener(openStory)
    return () => subscription.remove()
  }, [router, session.data])

  if (session.isPending) {
    return (
      <Screen top>
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
