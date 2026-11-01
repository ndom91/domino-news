import { nativeTokens as t } from '@dn/design-tokens/native'
import { countryName, KNOWN_COUNTRIES } from '@dn/domain'
import type { UserPreferences } from '@dn/schemas'
import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LocalitySettings } from '../../../../components/account/locality-settings'
import {
  PreferencesPage,
  SettingsPage,
  settingsStyles as s,
  useSavePreferences,
} from '../../../../components/account/settings'

const COUNTRIES = [...KNOWN_COUNTRIES].sort((a, b) => countryName(a).localeCompare(countryName(b)))

export default function LocationSettingsScreen() {
  const save = useSavePreferences()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [countryError, setCountryError] = useState<string | null>(null)

  function saveCountry(country: UserPreferences['country']) {
    setCountryError(null)
    save.mutate(
      { country },
      {
        onError: () => setCountryError('Your country preference could not be saved. Try again.'),
        onSuccess: () => setPickerOpen(false),
      },
    )
  }

  return (
    <PreferencesPage>
      {(settings) => {
        const disabled = save.isPending
        const current = settings.country ? countryName(settings.country) : 'No country preference'
        return (
          <>
            <SettingsPage>
              <View style={s.section}>
                <Text style={s.sectionTitle}>Country preference</Text>
                <Text style={s.description}>
                  Choose the country used for country-specific coverage insights.
                </Text>
                <Pressable
                  accessibilityHint="Opens country choices"
                  accessibilityLabel={`Country preference: ${current}`}
                  accessibilityRole="button"
                  disabled={disabled}
                  onPress={() => {
                    setCountryError(null)
                    setPickerOpen(true)
                  }}
                  style={({ pressed }) => [
                    styles.selectionRow,
                    disabled ? s.disabled : null,
                    pressed ? s.pressed : null,
                  ]}
                >
                  <Text style={styles.selectionLabel}>Country</Text>
                  <Text style={styles.selectionValue}>{current}</Text>
                </Pressable>
              </View>
              <LocalitySettings locality={settings.locality} />
            </SettingsPage>
            <Modal
              animationType="slide"
              onRequestClose={() => setPickerOpen(false)}
              transparent
              visible={pickerOpen}
            >
              <View
                accessibilityLabel="Country preference"
                accessibilityViewIsModal
                style={styles.sheetScrim}
              >
                <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet}>
                  <View style={styles.sheetHeader}>
                    <Text style={s.sectionTitle}>Country preference</Text>
                    <Pressable
                      accessibilityLabel="Close country choices"
                      accessibilityRole="button"
                      onPress={() => setPickerOpen(false)}
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
                    {COUNTRIES.map((country) => (
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
                    <Text accessibilityLiveRegion="polite" style={s.error}>
                      {countryError}
                    </Text>
                  ) : null}
                </SafeAreaView>
              </View>
            </Modal>
          </>
        )
      }}
    </PreferencesPage>
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
        pressed ? s.pressed : null,
      ]}
    >
      <Text style={[styles.countryChoiceText, active ? styles.countryChoiceTextActive : null]}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  selectionRow: {
    alignItems: 'center',
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: t.size.tap,
  },
  selectionLabel: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
  selectionValue: {
    color: t.color.textSecondary,
    fontFamily: t.font.medium,
    fontSize: t.type.body,
  },
  sheetScrim: { backgroundColor: 'rgba(18, 18, 18, 0.48)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: t.color.elevated, maxHeight: '82%', padding: t.space[5] },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: t.space[3],
  },
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
})
