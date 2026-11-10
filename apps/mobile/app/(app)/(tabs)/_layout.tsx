import { nativeTokens as t } from '@dn/design-tokens/native'
import Feather from '@expo/vector-icons/Feather'
import { Tabs } from 'expo-router'
import type { ComponentProps } from 'react'
import { StyleSheet } from 'react-native'
import { EditionStrip } from '../../../components/edition-strip'

const TINT = { active: t.color.accentText, inactive: t.color.textMuted }

// Coloured from `focused` rather than the tab bar's `color`: React Navigation types that as a
// ColorValue (which may be null or a number), and Feather takes only strings.
function tabIcon(name: ComponentProps<typeof Feather>['name']) {
  return ({ focused, size }: { focused: boolean; size: number }) => (
    <Feather color={focused ? TINT.active : TINT.inactive} name={name} size={size} />
  )
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        header: () => <EditionStrip />,
        sceneStyle: { backgroundColor: t.color.canvas },
        tabBarActiveTintColor: TINT.active,
        tabBarInactiveTintColor: TINT.inactive,
        tabBarIconStyle: { marginBottom: 1 },
        tabBarLabelStyle: { fontFamily: t.font.bold, fontSize: t.type.meta },
        tabBarStyle: {
          backgroundColor: t.color.surface,
          borderTopColor: t.color.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarItemStyle: { minHeight: t.size.tap },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Latest',
          tabBarAccessibilityLabel: 'Latest stories',
          tabBarIcon: tabIcon('home'),
        }}
      />
      <Tabs.Screen
        name="for-you"
        options={{
          title: 'For You',
          tabBarAccessibilityLabel: 'Stories picked for you',
          tabBarIcon: tabIcon('compass'),
        }}
      />
      <Tabs.Screen
        name="local"
        options={{
          title: 'Local',
          tabBarAccessibilityLabel: 'Local stories',
          tabBarIcon: tabIcon('map-pin'),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: tabIcon('search'),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          // The account stack draws its own headers.
          headerShown: false,
          title: 'Account',
          tabBarIcon: tabIcon('user'),
        }}
      />
    </Tabs>
  )
}
