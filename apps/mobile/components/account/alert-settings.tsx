import { nativeTokens as t } from '@dn/design-tokens/native'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import {
  disableForYouAlerts,
  enableForYouAlerts,
  type ForYouAlertsStatus,
  forYouAlertsAvailable,
  forYouAlertsStatus,
  syncForYouAlerts,
} from '../../lib/for-you-alerts'
import { Button } from '../ui'
import { SectionHeading } from './settings'

// AlertSettings confirms the installed device's server-side For You alert subscription.
export function AlertSettings() {
  const [status, setStatus] = useState<ForYouAlertsStatus | null>(null)
  const [pending, setPending] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setPending(true)
    setError(null)
    try {
      let next = await forYouAlertsStatus()
      if (next.enabled && !next.registered) next = await syncForYouAlerts()
      setStatus(next)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not confirm background alerts.')
    } finally {
      setPending(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function toggle(enabled: boolean) {
    setPending(true)
    setError(null)
    try {
      if (enabled) {
        setStatus(await enableForYouAlerts())
      } else {
        await disableForYouAlerts()
        setStatus({ enabled: false, registered: false })
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not update background alerts.')
    } finally {
      setPending(false)
    }
  }

  return (
    <View style={styles.section}>
      <SectionHeading>Background alerts</SectionHeading>
      <Text style={styles.description}>
        Domino Wire sends a notification when a new story surfaces in your For You feed.
      </Text>
      {forYouAlertsAvailable ? (
        <View style={styles.switchRow}>
          <Text style={styles.label}>Alert me about For You</Text>
          <Switch
            accessibilityLabel="Alert me about For You"
            disabled={pending || status === null}
            onValueChange={toggle}
            thumbColor={status?.enabled ? t.color.elevated : t.color.surface}
            trackColor={{ false: t.color.borderStrong, true: t.color.success }}
            value={status?.enabled ?? false}
          />
        </View>
      ) : (
        <Text style={styles.note}>Available in the installed Domino Wire development build.</Text>
      )}
      {status?.enabled && !status.registered ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          Alerts are enabled on this phone but not yet confirmed by the server.
        </Text>
      ) : null}
      {error ? (
        <View style={styles.errorGroup}>
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {error}
          </Text>
          <Button disabled={pending} onPress={refresh} tone="light">
            Try again
          </Button>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  description: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
  },
  error: { color: t.color.error, fontFamily: t.font.medium, fontSize: t.type.body, lineHeight: 22 },
  errorGroup: { gap: t.space[2] },
  label: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
  note: {
    color: t.color.textMuted,
    fontFamily: t.font.medium,
    fontSize: t.type.meta,
    lineHeight: 18,
  },
  section: { gap: t.space[4] },
  switchRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
})
