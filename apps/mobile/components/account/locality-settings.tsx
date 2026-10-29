import { nativeTokens as t } from '@dn/design-tokens/native'
import { savePreferencesMutation } from '@dn/queries'
import type { Place } from '@dn/schemas'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { api } from '../../lib/api'
import { Button, uiStyles } from '../ui'

export function LocalitySettings({ locality }: { locality: Place | null }) {
  const queryClient = useQueryClient()
  const save = useMutation(savePreferencesMutation(api, queryClient))
  const [country, setCountry] = useState(locality?.country ?? '')
  const [city, setCity] = useState(locality?.city ?? '')
  const [county, setCounty] = useState(locality?.county ?? '')
  const [error, setError] = useState('')
  function submit() {
    const code = country.trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(code)) {
      setError('Enter a two-letter country code, such as US or GB.')
      return
    }
    setError('')
    save.mutate({
      locality: { country: code, city: city.trim() || null, county: county.trim() || null },
    })
  }
  return (
    <View style={styles.section}>
      <Text style={uiStyles.label}>Local stories</Text>
      <Text style={styles.text}>
        Choose a country and optionally a city or local area. Your location is saved to your
        account.
      </Text>
      <Text style={styles.label}>Country code</Text>
      <TextInput
        accessibilityLabel="Country code"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={2}
        onChangeText={setCountry}
        placeholder="US"
        value={country}
        style={styles.input}
      />
      <Text style={styles.label}>City (optional)</Text>
      <TextInput
        accessibilityLabel="City"
        onChangeText={setCity}
        value={city}
        style={styles.input}
      />
      <Text style={styles.label}>County or local area (optional)</Text>
      <TextInput
        accessibilityLabel="County or local area"
        onChangeText={setCounty}
        value={county}
        style={styles.input}
      />
      {error || save.isError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error || 'Could not save your location. Try again.'}
        </Text>
      ) : null}
      <Button disabled={save.isPending} onPress={submit}>
        {save.isPending ? 'Saving…' : 'Save location'}
      </Button>
      {locality ? (
        <Button
          tone="light"
          disabled={save.isPending}
          onPress={() =>
            save.mutate(
              { locality: null },
              {
                onSuccess: () => {
                  setCountry('')
                  setCity('')
                  setCounty('')
                },
              },
            )
          }
        >
          Clear location
        </Button>
      ) : null}
    </View>
  )
}
const styles = StyleSheet.create({
  section: { gap: t.space[2], marginTop: t.space[10] },
  text: { color: t.color.textSecondary, fontFamily: t.font.regular, fontSize: t.type.body },
  label: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.meta },
  input: {
    borderColor: t.color.borderStrong,
    borderWidth: 1,
    color: t.color.text,
    minHeight: t.size.tap,
    paddingHorizontal: t.space[3],
  },
  error: { color: t.color.error, fontFamily: t.font.medium },
})
