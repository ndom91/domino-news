import { nativeTokens as t } from '@dn/design-tokens/native'
import { Archivo_400Regular } from '@expo-google-fonts/archivo/400Regular'
import { Archivo_500Medium } from '@expo-google-fonts/archivo/500Medium'
import { Archivo_600SemiBold } from '@expo-google-fonts/archivo/600SemiBold'
import { Archivo_700Bold } from '@expo-google-fonts/archivo/700Bold'
import { Archivo_900Black } from '@expo-google-fonts/archivo/900Black'
import { focusManager, onlineManager, QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import * as Network from 'expo-network'
import { Stack } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { createMobileQueryClient } from '../lib/query-client'

// React Native has no window focus or online events. Without these, polling (a story's context)
// keeps running in the background, and nothing refetches when the app or the network comes back.
focusManager.setEventListener((setFocused) => {
  const subscription = AppState.addEventListener('change', (state) =>
    setFocused(state === 'active'),
  )
  return () => subscription.remove()
})
onlineManager.setEventListener((setOnline) => {
  let revision = 0
  const update = (state: Network.NetworkState) => {
    revision++
    setOnline(state.isConnected !== false)
  }
  const refresh = () => {
    const current = ++revision
    void Network.getNetworkStateAsync()
      .then((state) => {
        // A newer native event or refresh takes precedence over this snapshot.
        if (current === revision) update(state)
      })
      .catch(() => {})
  }
  const network = Network.addNetworkStateListener(update)
  const app = AppState.addEventListener('change', (state) => {
    if (state === 'active') refresh()
  })
  refresh()
  return () => {
    revision++
    network.remove()
    app.remove()
  }
})

export default function RootLayout() {
  const [queryClient] = useState(createMobileQueryClient)
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
