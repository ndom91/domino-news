import { nativeTokens as t } from '@dn/design-tokens/native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Redirect, Stack, usePathname, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { StyleSheet } from 'react-native'
import { AudioBriefingProvider } from '../../components/audio-briefing-provider'
import { LoadingView, Screen } from '../../components/ui'
import { queries } from '../../lib/api'
import { authClient } from '../../lib/auth-client'
import { listenForStoryNotifications, syncForYouAlerts } from '../../lib/for-you-alerts'

export default function SignedInLayout() {
  const session = authClient.useSession()
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const userId = session.data?.user.id
  const preferences = useQuery({ ...queries.preferences(), enabled: Boolean(session.data) })
  const onOnboarding = pathname === '/onboarding'

  // The feed waits for preferences ("Preparing your feed"). Start Latest's reads alongside them
  // rather than one round trip later.
  useEffect(() => {
    if (!userId) return
    void queryClient.prefetchQuery(queries.front())
    void queryClient.prefetchInfiniteQuery(queries.storyList())
    void queryClient.prefetchQuery(queries.edition())
  }, [queryClient, userId])

  useEffect(() => {
    if (!userId) return

    let subscription: { remove: () => void } | undefined
    let disposed = false
    void syncForYouAlerts().catch((error) => {
      console.warn('Could not refresh push alerts', error)
    })
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
  }, [router, userId])

  if (session.isPending) {
    return (
      <Screen top>
        <LoadingView label="Restoring your session" />
      </Screen>
    )
  }
  if (!session.data) return <Redirect href="/sign-in" />
  if (!onOnboarding && preferences.isPending) {
    return (
      <Screen top>
        <LoadingView label="Preparing your feed" />
      </Screen>
    )
  }
  if (!onOnboarding && preferences.data && !preferences.data.onboarded) {
    return <Redirect href="/onboarding" />
  }

  return (
    <AudioBriefingProvider key={userId}>
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
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="briefing" options={{ headerTitle: 'Briefing' }} />
        <Stack.Screen
          name="stories/[slug]"
          options={{ headerBackTitle: 'Back', headerTitle: 'Story' }}
        />
        <Stack.Screen
          name="narratives/index"
          options={{ headerBackTitle: 'Back', headerTitle: 'Narratives' }}
        />
        <Stack.Screen
          name="narratives/[slug]"
          options={{ headerBackTitle: 'Back', headerTitle: 'Narrative' }}
        />
        <Stack.Screen
          name="publishers/index"
          options={{ headerBackTitle: 'Back', headerTitle: 'Publishers' }}
        />
        <Stack.Screen
          name="publishers/[slug]"
          options={{ headerBackTitle: 'Back', headerTitle: 'Publisher' }}
        />
      </Stack>
    </AudioBriefingProvider>
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
