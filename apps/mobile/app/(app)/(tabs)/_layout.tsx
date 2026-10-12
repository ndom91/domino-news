import { nativeTokens as t } from '@dn/design-tokens/native'
import { Tabs } from 'expo-router'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.color.band },
        headerTintColor: t.color.bandText,
        headerTitleStyle: { fontFamily: t.font.bold },
        sceneStyle: { backgroundColor: t.color.canvas },
        tabBarActiveTintColor: t.color.accentText,
        tabBarInactiveTintColor: t.color.textMuted,
        tabBarLabelStyle: { fontFamily: t.font.bold, fontSize: t.type.meta },
        tabBarStyle: { backgroundColor: t.color.surface, borderTopColor: t.color.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Latest', tabBarAccessibilityLabel: 'Latest stories' }}
      />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  )
}
