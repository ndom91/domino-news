import { nativeTokens as t } from '@dn/design-tokens/native'
import { queryKeys, savePreferencesMutation } from '@dn/queries'
import {
  DESK_LABELS,
  DESK_SLOT,
  DESKS,
  REGION_LABELS,
  REGIONS,
  TOPIC_DESK,
  TOPIC_LABELS,
  TOPICS,
  type UserPreferences,
  type UserPreferencesUpdate,
} from '@dn/schemas'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Redirect, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { Button, LoadingView, MessageView, Screen, uiStyles } from '../../../components/ui'
import { api, isUnauthorized, queries } from '../../../lib/api'
import { authClient } from '../../../lib/auth-client'
import {
  disableForYouAlerts,
  enableForYouAlerts,
  forYouAlertsAvailable,
  forYouAlertsEnabled,
} from '../../../lib/for-you-alerts'

export default function AccountScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const session = authClient.useSession()
  const preferences = useQuery(queries.preferences())
  const save = useMutation({
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
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [alertsEnabled, setAlertsEnabled] = useState(false)
  const [alertsPending, setAlertsPending] = useState(true)
  const [alertsError, setAlertsError] = useState<string | null>(null)
  const user = session.data?.user

  useEffect(() => {
    let mounted = true
    void forYouAlertsEnabled()
      .then((enabled) => {
        if (mounted) setAlertsEnabled(enabled)
      })
      .catch((error) => {
        if (mounted) {
          setAlertsError(
            error instanceof Error ? error.message : 'Could not check background alerts.',
          )
        }
      })
      .finally(() => {
        if (mounted) setAlertsPending(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  async function signOut() {
    setSigningOut(true)
    setSignOutError(null)
    const result = await authClient.signOut()
    if (!result.error) {
      try {
        await disableForYouAlerts()
      } catch {}
      queryClient.clear()
      router.replace('/sign-in')
      return
    }
    setSigningOut(false)
    setSignOutError(result.error.message ?? 'Could not sign out. Try again.')
  }

  async function toggleAlerts(enabled: boolean) {
    setAlertsPending(true)
    setAlertsError(null)
    try {
      if (enabled) await enableForYouAlerts()
      else await disableForYouAlerts()
      setAlertsEnabled(enabled)
    } catch (error) {
      setAlertsError(error instanceof Error ? error.message : 'Could not update background alerts.')
    } finally {
      setAlertsPending(false)
    }
  }

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

  const settings = preferences.data
  const disabled = save.isPending

  return (
    <Screen>
      <ScrollView contentContainerStyle={uiStyles.content}>
        <View style={styles.hero}>
          <Text style={uiStyles.eyebrow}>Your reader profile</Text>
          <Text style={styles.heading}>Account</Text>
          <Text style={styles.name}>{user?.name ?? 'Reader'}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your feed</Text>
          <Text style={styles.description}>
            Stories matching these move to the top of For You. Nothing else is hidden.
          </Text>
          <PickGroup
            disabled={disabled}
            label="Regions"
            onToggle={(region) => save.mutate({ regions: toggle(settings.regions, region) })}
            options={REGIONS}
            selected={settings.regions}
            titleFor={(region) => REGION_LABELS[region]}
          />
          <PickGroup
            disabled={disabled}
            label="Desks"
            onToggle={(desk) => save.mutate({ desks: toggle(settings.desks, desk) })}
            options={DESKS}
            selected={settings.desks}
            textColorFor={(desk) => t.color.narrativeText[DESK_SLOT[desk]] ?? t.color.bandText}
            tintFor={(desk) => t.color.narrative[DESK_SLOT[desk]] ?? t.color.accent}
            titleFor={(desk) => DESK_LABELS[desk]}
          />
          <Text style={styles.groupLabel}>Topics</Text>
          {DESKS.map((desk) => (
            <PickGroup
              disabled={disabled}
              key={desk}
              label={DESK_LABELS[desk]}
              onToggle={(topic) => save.mutate({ topics: toggle(settings.topics, topic) })}
              options={TOPICS.filter((topic) => TOPIC_DESK[topic] === desk)}
              selected={settings.topics}
              textColorFor={() => t.color.narrativeText[DESK_SLOT[desk]] ?? t.color.bandText}
              tintFor={() => t.color.narrative[DESK_SLOT[desk]] ?? t.color.accent}
              titleFor={(topic) => TOPIC_LABELS[topic]}
            />
          ))}
          {save.isError ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              Your picks could not be saved. Try again.
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Background alerts</Text>
          <Text style={styles.description}>
            When your phone gives Domino News a background window, it checks For You and lets you
            know about a newly surfaced story.
          </Text>
          {forYouAlertsAvailable ? (
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Alert me about For You</Text>
              <Switch
                accessibilityLabel="Alert me about For You"
                disabled={alertsPending}
                onValueChange={toggleAlerts}
                thumbColor={alertsEnabled ? t.color.elevated : t.color.surface}
                trackColor={{ false: t.color.borderStrong, true: t.color.success }}
                value={alertsEnabled}
              />
            </View>
          ) : (
            <Text style={styles.alertNote}>
              Available in the installed Domino News development build.
            </Text>
          )}
          {alertsError ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {alertsError}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reading history</Text>
          <Text style={styles.description}>
            Keep the stories you read for 30 days to power Blindspot. It stays off unless you opt
            in.
          </Text>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Remember what I read</Text>
            <Switch
              accessibilityLabel="Remember what I read"
              disabled={disabled}
              onValueChange={(rememberReads) => save.mutate({ rememberReads })}
              thumbColor={settings.rememberReads ? t.color.elevated : t.color.surface}
              trackColor={{ false: t.color.borderStrong, true: t.color.success }}
              value={settings.rememberReads}
            />
          </View>
        </View>

        {signOutError ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {signOutError}
          </Text>
        ) : null}
        <Button disabled={signingOut} onPress={signOut}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </Button>
      </ScrollView>
    </Screen>
  )
}

function PickGroup<T extends string>({
  disabled,
  label,
  onToggle,
  options,
  selected,
  textColorFor,
  tintFor,
  titleFor,
}: {
  disabled: boolean
  label: string
  onToggle: (value: T) => void
  options: readonly T[]
  selected: readonly T[]
  textColorFor?: (value: T) => string
  tintFor?: (value: T) => string
  titleFor: (value: T) => string
}) {
  return (
    <View style={styles.pickGroup}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const picked = selected.includes(option)
          const tint = tintFor?.(option)
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled, selected: picked }}
              disabled={disabled}
              key={option}
              onPress={() => onToggle(option)}
              style={({ pressed }) => [
                styles.chip,
                picked ? styles.chipSelected : null,
                picked && tint ? { backgroundColor: tint } : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  picked ? styles.chipTextSelected : null,
                  picked && textColorFor ? { color: textColorFor(option) } : null,
                ]}
              >
                {titleFor(option)}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

function toggle<T>(items: readonly T[], item: T): T[] {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item]
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: t.color.band,
    gap: t.space[2],
    margin: -t.space[4],
    padding: t.space[5],
  },
  heading: { color: t.color.bandText, fontFamily: t.font.black, fontSize: 42, letterSpacing: -1.5 },
  name: { color: t.color.bandMuted, fontFamily: t.font.semibold, fontSize: t.type.bodyLarge },
  section: { gap: t.space[4], marginTop: t.space[8] },
  sectionTitle: { color: t.color.text, fontFamily: t.font.black, fontSize: t.type.headline },
  description: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
  },
  pickGroup: { gap: t.space[2] },
  groupLabel: {
    color: t.color.textMuted,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space[2] },
  chip: {
    borderColor: t.color.borderStrong,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: t.size.tap,
    paddingHorizontal: t.space[3],
  },
  chipSelected: { backgroundColor: t.color.band, borderColor: t.color.band },
  chipText: { color: t.color.textSecondary, fontFamily: t.font.bold, fontSize: t.type.meta },
  chipTextSelected: { color: t.color.bandText },
  switchRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  switchLabel: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
  error: { color: t.color.error, fontFamily: t.font.medium, fontSize: t.type.body, lineHeight: 22 },
  alertNote: {
    color: t.color.textMuted,
    fontFamily: t.font.medium,
    fontSize: t.type.meta,
    lineHeight: 18,
  },
  pressed: { opacity: 0.68 },
})
