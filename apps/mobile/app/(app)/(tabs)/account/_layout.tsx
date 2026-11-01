import { nativeTokens as t } from '@dn/design-tokens/native'
import { Stack } from 'expo-router'
import { StyleSheet } from 'react-native'
import { EditionStrip } from '../../../../components/edition-strip'

// Account settings push inside the tab, like the system Settings apps, so the tab bar stays.
export default function AccountLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: styles.screen,
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerStyle: styles.header,
        headerTintColor: t.color.bandText,
        headerTitleStyle: styles.headerTitle,
      }}
    >
      <Stack.Screen name="index" options={{ header: () => <EditionStrip /> }} />
      <Stack.Screen name="feed" options={{ title: 'Your feed' }} />
      <Stack.Screen name="following" options={{ title: 'Following' }} />
      <Stack.Screen name="learned" options={{ title: 'Learned from feedback' }} />
      <Stack.Screen name="location" options={{ title: 'Location' }} />
      <Stack.Screen name="alerts" options={{ title: 'Notifications' }} />
      <Stack.Screen name="audio" options={{ title: 'Audio briefing' }} />
      <Stack.Screen name="history" options={{ title: 'Reading history' }} />
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
