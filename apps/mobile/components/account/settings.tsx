import { nativeTokens as t } from '@dn/design-tokens/native'
import { queryKeys, savePreferencesMutation } from '@dn/queries'
import type { UserPreferences, UserPreferencesUpdate } from '@dn/schemas'
import Feather from '@expo/vector-icons/Feather'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Redirect } from 'expo-router'
import type { ComponentProps, ReactNode } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { api, isUnauthorized, queries } from '../../lib/api'
import { LoadingView, MessageView, Screen, uiStyles } from '../ui'

/** Saves preferences optimistically, so switches and picks respond before the server does. */
export function useSavePreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    ...savePreferencesMutation(api, queryClient),
    onMutate: async (update: UserPreferencesUpdate) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.preferences() })
      const previous = queryClient.getQueryData<UserPreferences>(queryKeys.preferences())
      if (previous) {
        queryClient.setQueryData<UserPreferences>(queryKeys.preferences(), {
          ...previous,
          ...update,
          onboarded: previous.onboarded || update.onboarded === true,
        })
      }
      return { previous }
    },
    onError: (_error, _update, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.preferences(), context.previous)
      void queryClient.invalidateQueries({ queryKey: queryKeys.preferences() })
    },
  })
}

export function SettingsPage({ children }: { children: ReactNode }) {
  return (
    <Screen>
      <ScrollView contentContainerStyle={[uiStyles.content, styles.page]}>{children}</ScrollView>
    </Screen>
  )
}

/** Loads the reader's preferences, then renders the page with them. */
export function PreferencesPage({
  children,
}: {
  children: (settings: UserPreferences) => ReactNode
}) {
  const preferences = useQuery(queries.preferences())
  if (preferences.isPending)
    return (
      <Screen>
        <LoadingView label="Loading account" />
      </Screen>
    )
  if (isUnauthorized(preferences.error)) return <Redirect href="/sign-in" />
  if (preferences.isError) {
    return (
      <Screen>
        <MessageView
          action={{ label: 'Try again', onPress: preferences.refetch }}
          detail="Check your connection, then try again."
          title="Account is unavailable"
        />
      </Screen>
    )
  }
  return <>{children(preferences.data)}</>
}

/** Labels a section of a settings page. The native header already names the page itself. */
export function SectionHeading({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={uiStyles.eyebrow}>
      {children}
    </Text>
  )
}

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <SectionHeading>{title}</SectionHeading>
      <View style={styles.groupRows}>{children}</View>
    </View>
  )
}

type FeatherName = ComponentProps<typeof Feather>['name']

/**
 * A settings row. Navigation rows get a chevron on iOS only (Android settings rows don't use
 * one); `external` rows open a link; `action` rows act in place, so they get no trailing icon.
 */
export function SettingsRow({
  icon,
  title,
  detail,
  kind = 'navigate',
  destructive = false,
  disabled = false,
  onPress,
}: {
  icon: FeatherName
  title: string
  detail?: string
  kind?: 'navigate' | 'external' | 'action'
  destructive?: boolean
  disabled?: boolean
  onPress: () => void
}) {
  const tint = destructive ? t.color.error : t.color.textSecondary
  return (
    <Pressable
      accessibilityHint={kind === 'external' ? 'Opens outside the app' : undefined}
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      accessibilityRole={kind === 'external' ? 'link' : 'button'}
      accessibilityState={{ disabled }}
      android_ripple={{ color: t.color.border }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        disabled ? settingsStyles.disabled : null,
        pressed && Platform.OS === 'ios' ? styles.rowPressed : null,
      ]}
    >
      <Feather aria-hidden color={tint} name={icon} size={20} />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, destructive ? styles.rowTitleDestructive : null]}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={1} style={styles.rowDetail}>
            {detail}
          </Text>
        ) : null}
      </View>
      {kind === 'external' ? (
        <Feather aria-hidden color={t.color.textMuted} name="external-link" size={16} />
      ) : kind === 'navigate' && Platform.OS === 'ios' ? (
        <Feather aria-hidden color={t.color.textMuted} name="chevron-right" size={20} />
      ) : null}
    </Pressable>
  )
}

export const settingsStyles = StyleSheet.create({
  section: { gap: t.space[4] },
  sectionTitle: { color: t.color.text, fontFamily: t.font.black, fontSize: t.type.headline },
  description: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
  },
  error: { color: t.color.error, fontFamily: t.font.medium, fontSize: t.type.body, lineHeight: 22 },
  note: {
    color: t.color.textMuted,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 22,
  },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.68 },
})

const styles = StyleSheet.create({
  page: { gap: t.space[8] },
  group: { gap: t.space[2] },
  groupRows: {
    backgroundColor: t.color.surface,
    borderTopColor: t.color.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: t.space[3],
    minHeight: 56,
    paddingHorizontal: t.space[4],
    paddingVertical: t.space[3],
  },
  rowPressed: { backgroundColor: t.color.border },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
  rowTitleDestructive: { color: t.color.error },
  rowDetail: { color: t.color.textSecondary, fontFamily: t.font.regular, fontSize: t.type.meta },
})
