import { Archivo_400Regular } from '@expo-google-fonts/archivo/400Regular'
import { Archivo_500Medium } from '@expo-google-fonts/archivo/500Medium'
import { Archivo_600SemiBold } from '@expo-google-fonts/archivo/600SemiBold'
import { Archivo_700Bold } from '@expo-google-fonts/archivo/700Bold'
import { Archivo_900Black } from '@expo-google-fonts/archivo/900Black'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import { useState } from 'react'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient())
  const [fontsLoaded, fontError] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_900Black,
  })

  if (!fontsLoaded && !fontError) return <View />

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
