import { nativeTokens as t } from '@dn/design-tokens/native'
import { countryName, KNOWN_COUNTRIES } from '@dn/domain'
import {
  queryKeys,
  savePreferencesMutation,
  setFollowMutation,
  updateSignalsMutation,
} from '@dn/queries'
import type { UserPreferences, UserPreferencesUpdate } from '@dn/schemas'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Redirect, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { FeedPicks } from '../../../components/feed-picks'
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
  const follows = useQuery(queries.follows())
  const signals = useQuery(queries.signals())
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
  const [countryPickerOpen, setCountryPickerOpen] = useState(false)
  const [countryError, setCountryError] = useState<string | null>(null)
  const [confirmReadingHistoryOff, setConfirmReadingHistoryOff] = useState(false)
  const [confirmSignalsReset, setConfirmSignalsReset] = useState(false)
  const followSave = useMutation(setFollowMutation(api, queryClient))
  const signalSave = useMutation(updateSignalsMutation(api, queryClient))
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

  function saveCountry(country: UserPreferences['country']) {
    setCountryError(null)
    save.mutate(
      { country },
      {
        onError: () => setCountryError('Your country preference could not be saved. Try again.'),
        onSuccess: () => setCountryPickerOpen(false),
      },
    )
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
          <FeedPicks
            disabled={disabled}
            onChange={(update) => save.mutate(update)}
            sections={['regions', 'desks', 'topics']}
            values={settings}
          />
          {save.isError ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              Your picks could not be saved. Try again.
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Country preference</Text>
          <Text style={styles.description}>
            Choose which country’s publisher lean context appears first on stories.
          </Text>
          <Pressable
            accessibilityHint="Opens country choices"
            accessibilityLabel={`Country preference: ${settings.country ? countryName(settings.country) : 'No country preference'}`}
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => {
              setCountryError(null)
              setCountryPickerOpen(true)
            }}
            style={({ pressed }) => [
              styles.selectionRow,
              disabled ? styles.selectionRowDisabled : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.selectionLabel}>Country</Text>
            <Text style={styles.selectionValue}>
              {settings.country ? countryName(settings.country) : 'No country preference'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Background alerts</Text>
          <Text style={styles.description}>
            When your phone gives Domino Wire a background window, it checks For You and lets you
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
              Available in the installed Domino Wire development build.
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
              onValueChange={(rememberReads) => {
                if (!rememberReads && settings.rememberReads) setConfirmReadingHistoryOff(true)
                else save.mutate({ rememberReads })
              }}
              thumbColor={settings.rememberReads ? t.color.elevated : t.color.surface}
              trackColor={{ false: t.color.borderStrong, true: t.color.success }}
              value={settings.rememberReads}
            />
          </View>
          <Pressable
            accessibilityHint="Opens your Blindspot"
            accessibilityLabel="View Blindspot"
            accessibilityRole="button"
            onPress={() => router.push('/blindspot')}
            style={({ pressed }) => [styles.navigationRow, pressed ? styles.pressed : null]}
          >
            <View>
              <Text style={styles.navigationTitle}>View Blindspot</Text>
              <Text style={styles.navigationDetail}>
                See gaps and new developments in your reading.
              </Text>
            </View>
            <Text aria-hidden style={styles.navigationArrow}>
              ›
            </Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Following</Text>
          <Text style={styles.description}>
            Stories from these publishers and narratives rank higher in For You.
          </Text>
          {follows.isPending ? <Text style={styles.note}>Loading follows…</Text> : null}
          {follows.isError ? (
            <Text style={styles.error}>Your follows could not be loaded.</Text>
          ) : null}
          {follows.data?.items.length === 0 ? (
            <Text style={styles.note}>Follow publishers or narratives to tune your feed.</Text>
          ) : null}
          {follows.data?.items.map((follow) => (
            <View key={`${follow.targetType}-${follow.id}`} style={styles.followRow}>
              <Pressable
                accessibilityHint={`Opens this ${follow.targetType}`}
                accessibilityLabel={follow.title}
                accessibilityRole="link"
                onPress={() =>
                  router.push(
                    follow.targetType === 'narrative'
                      ? `/narratives/${follow.slug}`
                      : `/publishers/${follow.slug}`,
                  )
                }
                style={({ pressed }) => [styles.followTarget, pressed ? styles.pressed : null]}
              >
                <Text style={styles.followTitle}>{follow.title}</Text>
                <Text style={styles.followKind}>{follow.targetType}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Unfollow ${follow.title}`}
                accessibilityRole="button"
                disabled={followSave.isPending}
                onPress={() =>
                  followSave.mutate({
                    follow: false,
                    targetId: follow.id,
                    targetType: follow.targetType,
                  })
                }
                style={({ pressed }) => [
                  styles.unfollow,
                  followSave.isPending ? styles.selectionRowDisabled : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.unfollowText}>Unfollow</Text>
              </Pressable>
            </View>
          ))}
          {followSave.isError ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              That follow could not be updated. Try again.
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Learned from your feedback</Text>
          <Text style={styles.description}>
            “More” and “Less” adjust these signals. You can remove a signal or start over.
          </Text>
          {signals.isPending ? <Text style={styles.note}>Loading learned signals…</Text> : null}
          {signals.isError ? (
            <Text style={styles.error}>Your learned signals could not be loaded.</Text>
          ) : null}
          {signals.data?.items.length === 0 ? (
            <Text style={styles.note}>Use “More” or “Less” in For You to teach the feed.</Text>
          ) : null}
          {signals.data?.items.map((signal) => (
            <View key={`${signal.kind}-${signal.key}`} style={styles.signalRow}>
              <View style={styles.signalText}>
                <Text style={styles.signalLabel}>{signal.label}</Text>
                <Text style={styles.signalDetail}>
                  {signal.kind} · {signal.weight > 0 ? 'More like this' : 'Less like this'}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={`Remove learned signal for ${signal.label}`}
                accessibilityRole="button"
                disabled={signalSave.isPending}
                onPress={() =>
                  signalSave.mutate({ remove: { key: signal.key, kind: signal.kind } })
                }
                style={({ pressed }) => [
                  styles.removeSignal,
                  signalSave.isPending ? styles.selectionRowDisabled : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.removeSignalText}>Remove</Text>
              </Pressable>
            </View>
          ))}
          {signals.data && signals.data.items.length > 0 ? (
            <Button
              disabled={signalSave.isPending}
              onPress={() => setConfirmSignalsReset(true)}
              tone="light"
            >
              Reset learned signals
            </Button>
          ) : null}
          {signalSave.isError ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              Your learned signals could not be updated. Try again.
            </Text>
          ) : null}
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
      <Modal
        animationType="slide"
        onRequestClose={() => setCountryPickerOpen(false)}
        transparent
        visible={countryPickerOpen}
      >
        <View
          accessibilityLabel="Country preference"
          accessibilityViewIsModal
          style={styles.sheetScrim}
        >
          <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Country preference</Text>
              <Pressable
                accessibilityLabel="Close country choices"
                accessibilityRole="button"
                onPress={() => setCountryPickerOpen(false)}
                style={styles.close}
              >
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.countryList}>
              <CountryChoice
                active={settings.country === null}
                disabled={disabled}
                label="No country preference"
                onPress={() => saveCountry(null)}
              />
              {[...KNOWN_COUNTRIES]
                .sort((a, b) => countryName(a).localeCompare(countryName(b)))
                .map((country) => (
                  <CountryChoice
                    active={settings.country === country}
                    disabled={disabled}
                    key={country}
                    label={countryName(country)}
                    onPress={() => saveCountry(country)}
                  />
                ))}
            </ScrollView>
            {countryError ? (
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                {countryError}
              </Text>
            ) : null}
          </SafeAreaView>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        onRequestClose={() => setConfirmReadingHistoryOff(false)}
        transparent
        visible={confirmReadingHistoryOff}
      >
        <View
          accessibilityLabel="Turn off reading history confirmation"
          accessibilityViewIsModal
          style={styles.dialogScrim}
        >
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Turn off reading history?</Text>
            <Text style={styles.dialogText}>
              Blindspot will stop recording stories you open and delete your saved reading history.
            </Text>
            <View style={styles.dialogActions}>
              <Button onPress={() => setConfirmReadingHistoryOff(false)} tone="light">
                Keep history
              </Button>
              <Button
                disabled={disabled}
                onPress={() => {
                  save.mutate({ rememberReads: false })
                  setConfirmReadingHistoryOff(false)
                }}
              >
                Turn off history
              </Button>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        animationType="fade"
        onRequestClose={() => setConfirmSignalsReset(false)}
        transparent
        visible={confirmSignalsReset}
      >
        <View
          accessibilityLabel="Reset learned signals confirmation"
          accessibilityViewIsModal
          style={styles.dialogScrim}
        >
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>Reset learned signals?</Text>
            <Text style={styles.dialogText}>
              This removes all feedback learned from your “More” and “Less” choices and restores any
              stories hidden by “Less”.
            </Text>
            <View style={styles.dialogActions}>
              <Button onPress={() => setConfirmSignalsReset(false)} tone="light">
                Keep signals
              </Button>
              <Button
                disabled={signalSave.isPending}
                onPress={() => {
                  signalSave.mutate({ reset: true })
                  setConfirmSignalsReset(false)
                }}
              >
                Reset signals
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  )
}

function CountryChoice({
  active,
  disabled,
  label,
  onPress,
}: {
  active: boolean
  disabled: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.countryChoice,
        active ? styles.countryChoiceActive : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={[styles.countryChoiceText, active ? styles.countryChoiceTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  )
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
  switchRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  switchLabel: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
  selectionRow: {
    alignItems: 'center',
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: t.size.tap,
  },
  selectionRowDisabled: { opacity: 0.45 },
  selectionLabel: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
  selectionValue: {
    color: t.color.textSecondary,
    fontFamily: t.font.medium,
    fontSize: t.type.body,
  },
  navigationRow: {
    alignItems: 'center',
    borderTopColor: t.color.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: t.size.tap,
    paddingTop: t.space[3],
  },
  navigationTitle: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
  navigationDetail: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.meta,
    marginTop: t.space[1],
  },
  navigationArrow: { color: t.color.accentText, fontFamily: t.font.regular, fontSize: 32 },
  error: { color: t.color.error, fontFamily: t.font.medium, fontSize: t.type.body, lineHeight: 22 },
  note: {
    color: t.color.textMuted,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 22,
  },
  followRow: {
    alignItems: 'center',
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: t.space[3],
    minHeight: t.size.tap,
  },
  followTarget: { flex: 1, justifyContent: 'center', paddingVertical: t.space[2] },
  followTitle: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
  followKind: {
    color: t.color.textMuted,
    fontFamily: t.font.medium,
    fontSize: t.type.meta,
    textTransform: 'capitalize',
  },
  unfollow: { justifyContent: 'center', minHeight: t.size.tap, paddingHorizontal: t.space[2] },
  unfollowText: { color: t.color.accentText, fontFamily: t.font.bold, fontSize: t.type.meta },
  signalRow: {
    alignItems: 'center',
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: t.space[3],
    minHeight: t.size.tap,
  },
  signalText: { flex: 1, paddingVertical: t.space[2] },
  signalLabel: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
  signalDetail: { color: t.color.textMuted, fontFamily: t.font.regular, fontSize: t.type.meta },
  removeSignal: { justifyContent: 'center', minHeight: t.size.tap, paddingHorizontal: t.space[2] },
  removeSignalText: { color: t.color.accentText, fontFamily: t.font.bold, fontSize: t.type.meta },
  alertNote: {
    color: t.color.textMuted,
    fontFamily: t.font.medium,
    fontSize: t.type.meta,
    lineHeight: 18,
  },
  pressed: { opacity: 0.68 },
  sheetScrim: { backgroundColor: 'rgba(18, 18, 18, 0.48)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: t.color.elevated, maxHeight: '82%', padding: t.space[5] },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: t.space[3],
  },
  sheetTitle: { color: t.color.text, fontFamily: t.font.black, fontSize: t.type.headline },
  close: {
    alignItems: 'center',
    borderColor: t.color.rule,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: t.size.tap,
    paddingHorizontal: t.space[3],
  },
  closeText: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.meta },
  countryList: { gap: t.space[1], paddingBottom: t.space[3] },
  countryChoice: { justifyContent: 'center', minHeight: t.size.tap, paddingHorizontal: t.space[3] },
  countryChoiceActive: { backgroundColor: t.color.band },
  countryChoiceText: { color: t.color.text, fontFamily: t.font.medium, fontSize: t.type.body },
  countryChoiceTextActive: { color: t.color.bandText, fontFamily: t.font.bold },
  dialogScrim: {
    alignItems: 'center',
    backgroundColor: 'rgba(18, 18, 18, 0.48)',
    flex: 1,
    justifyContent: 'center',
    padding: t.space[5],
  },
  dialog: {
    backgroundColor: t.color.elevated,
    gap: t.space[4],
    maxWidth: 420,
    padding: t.space[5],
  },
  dialogTitle: { color: t.color.text, fontFamily: t.font.black, fontSize: t.type.headline },
  dialogText: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
  },
  dialogActions: { gap: t.space[2] },
})
