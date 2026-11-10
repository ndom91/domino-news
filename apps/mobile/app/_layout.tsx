import { ApiError } from '@dn/api-client'
import { nativeTokens as t } from '@dn/design-tokens/native'
import { Archivo_400Regular } from '@expo-google-fonts/archivo/400Regular'
import { Archivo_500Medium } from '@expo-google-fonts/archivo/500Medium'
import { Archivo_600SemiBold } from '@expo-google-fonts/archivo/600SemiBold'
import { Archivo_700Bold } from '@expo-google-fonts/archivo/700Bold'
import { Archivo_900Black } from '@expo-google-fonts/archivo/900Black'
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import * as Network from 'expo-network'
import { Stack } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

// React Native has no window focus or online events. Without these, polling (a story's context)
// keeps running in the background, and nothing refetches when the app or the network comes back.
focusManager.setEventListener((setFocused) => {
  const subscription = AppState.addEventListener('change', (state) =>
    setFocused(state === 'active'),
  )
  return () => subscription.remove()
})
onlineManager.setEventListener((setOnline) => {
  const subscription = Network.addNetworkStateListener((state) =>
    setOnline(Boolean(state.isConnected)),
  )
  return () => subscription.remove()
})

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (failures, error) =>
              !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
              failures < 3,
          },
          mutations: { retry: false },
        },
      }),
  )
  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_900Black,
  })

  if (!fontsLoaded && !fontError) {
    return (
      <View
        accessibilityLabel="Loading Domino Wire"
        accessibilityRole="progressbar"
        style={styles.loading}
      >
        <ActivityIndicator color={t.color.accentText} />
        <Text style={styles.loadingText}>Loading Domino Wire…</Text>
      </View>
    )
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(app)" />
          <Stack.Screen name="sign-in" />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: t.color.canvas,
    flex: 1,
    gap: t.space[3],
    justifyContent: 'center',
  },
  loadingText: { color: t.color.textMuted, fontFamily: t.font.medium, fontSize: t.type.body },
})
