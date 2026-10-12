import { nativeTokens as t } from '@dn/design-tokens/native'
import { Redirect, Stack, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import { LoadingView, Screen } from '../../components/ui'
import { authClient } from '../../lib/auth-client'
import { listenForStoryNotifications } from '../../lib/for-you-alerts'

export default function SignedInLayout() {
  const session = authClient.useSession()
  const router = useRouter()

  useEffect(() => {
    if (!session.data) return

    let subscription: { remove: () => void } | undefined
    let disposed = false
    void listenForStoryNotifications((storySlug) => {
      router.push({ pathname: '/stories/[slug]', params: { slug: storySlug } })
    }).then((nextSubscription) => {
      if (disposed) nextSubscription.remove()
      else subscription = nextSubscription
    })
    return () => {
      disposed = true
      subscription?.remove()
    }
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
    <Stack
      screenOptions={{
        contentStyle: styles.screen,
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerStyle: styles.header,
        headerTintColor: t.color.bandText,
        headerTitleStyle: styles.headerTitle,
        statusBarBackgroundColor: t.color.band,
        statusBarStyle: 'light',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="stories/[slug]"
        options={{ headerBackTitle: 'Back', headerTitle: 'Story' }}
      />
    </Stack>
  )
}

const styles = StyleSheet.create({
  screen: { backgroundColor: t.color.canvas },
  header: { backgroundColor: t.color.band },
  headerTitle: {
    color: t.color.bandText,
    fontFamily: t.font.black,
    fontSize: t.type.body,
    letterSpacing: -0.3,
  },
})
