import { nativeTokens as t } from '@dn/design-tokens/native'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Switch, Text, View } from 'react-native'
import { ConfirmationDialog } from '../../../../components/account/confirmation-dialog'
import {
  PreferencesPage,
  SettingsGroup,
  SettingsPage,
  SettingsRow,
  settingsStyles as s,
  useSavePreferences,
} from '../../../../components/account/settings'

export default function ReadingHistoryScreen() {
  const router = useRouter()
  const save = useSavePreferences()
  const [confirmOff, setConfirmOff] = useState(false)
  return (
    <PreferencesPage>
      {(settings) => (
        <>
          <SettingsPage>
            <View style={s.section}>
              <Text style={s.description}>
                Keep the stories you read for 30 days to power Blindspot. It stays off unless you
                opt in.
              </Text>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Remember what I read</Text>
                <Switch
                  accessibilityLabel="Remember what I read"
                  disabled={save.isPending}
                  onValueChange={(rememberReads) => {
                    if (!rememberReads && settings.rememberReads) setConfirmOff(true)
                    else save.mutate({ rememberReads })
                  }}
                  thumbColor={settings.rememberReads ? t.color.elevated : t.color.surface}
                  trackColor={{ false: t.color.borderStrong, true: t.color.success }}
                  value={settings.rememberReads}
                />
              </View>
              {save.isError ? (
                <Text accessibilityLiveRegion="polite" style={s.error}>
                  Your reading history setting could not be saved. Try again.
                </Text>
              ) : null}
            </View>
            <SettingsGroup title="Blindspot">
              <SettingsRow
                detail="See gaps and new developments in your reading."
                icon="eye"
                onPress={() => router.push('/account/blindspot')}
                title="View Blindspot"
              />
            </SettingsGroup>
          </SettingsPage>
          <ConfirmationDialog
            cancelLabel="Keep history"
            confirmLabel="Turn off history"
            detail="Blindspot will stop recording stories you open and delete your saved reading history."
            onCancel={() => setConfirmOff(false)}
            onConfirm={() => {
              save.mutate({ rememberReads: false })
              setConfirmOff(false)
            }}
            pending={save.isPending}
            title="Turn off reading history?"
            visible={confirmOff}
          />
        </>
      )}
    </PreferencesPage>
  )
}

const styles = StyleSheet.create({
  switchRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  switchLabel: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
})
