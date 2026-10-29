import { nativeTokens as t } from '@dn/design-tokens/native'
import Feather from '@expo/vector-icons/Feather'
import { Tabs } from 'expo-router'
import { StyleSheet } from 'react-native'
import { EditionStrip } from '../../../components/edition-strip'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        header: () => <EditionStrip />,
        sceneStyle: { backgroundColor: t.color.canvas },
        tabBarActiveTintColor: t.color.accentText,
        tabBarInactiveTintColor: t.color.textMuted,
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
          tabBarIcon: ({ color, size }) => (
            <Feather
              color={typeof color === 'string' ? color : t.color.textMuted}
              name="home"
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="for-you"
        options={{
          title: 'For You',
          tabBarAccessibilityLabel: 'Stories picked for you',
          tabBarIcon: ({ color, size }) => (
            <Feather
              color={typeof color === 'string' ? color : t.color.textMuted}
              name="compass"
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="local"
        options={{
          title: 'Local',
          tabBarAccessibilityLabel: 'Local stories',
          tabBarIcon: ({ color, size }) => (
            <Feather
              color={typeof color === 'string' ? color : t.color.textMuted}
              name="map-pin"
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => (
            <Feather
              color={typeof color === 'string' ? color : t.color.textMuted}
              name="search"
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, size }) => (
            <Feather
              color={typeof color === 'string' ? color : t.color.textMuted}
              name="user"
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  )
}
