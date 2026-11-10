import { nativeTokens as t } from '@dn/design-tokens/native'
import { savePreferencesMutation } from '@dn/queries'
import type { AudioBriefingStyle } from '@dn/schemas'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { api } from '../../lib/api'
import { authClient } from '../../lib/auth-client'
import { Button, TextField } from '../ui'
import { SectionHeading } from './settings'

export function AudioSettings({ style, name }: { style: AudioBriefingStyle; name: string }) {
  const queryClient = useQueryClient()
  const save = useMutation(savePreferencesMutation(api, queryClient))
  const [draft, setDraft] = useState(name)
  const [nameError, setNameError] = useState('')
  const [savingName, setSavingName] = useState(false)
  async function saveName() {
    if (!draft.trim()) {
      setNameError('Enter a name.')
      return
    }
    setSavingName(true)
    setNameError('')
    try {
      const result = await authClient.updateUser({ name: draft.trim() })
      if (result.error) throw new Error(result.error.message ?? 'Could not save your name.')
    } catch (error) {
      setNameError(error instanceof Error ? error.message : 'Could not save your name.')
    } finally {
      setSavingName(false)
    }
  }
  return (
    <View style={styles.section}>
      <SectionHeading>Presentation style</SectionHeading>
      <Text style={styles.text}>
        Choose a presentation style. Radio may include fictional sponsor jokes.
      </Text>
      <View style={styles.row}>
        <Button
          disabled={save.isPending}
          tone={style === 'professional' ? 'dark' : 'light'}
          onPress={() => save.mutate({ audioBriefingStyle: 'professional' })}
        >
          Professional
        </Button>
        <Button
          disabled={save.isPending}
          tone={style === 'radio' ? 'dark' : 'light'}
          onPress={() => save.mutate({ audioBriefingStyle: 'radio' })}
        >
          Radio show
        </Button>
      </View>
      {save.isError ? (
        <Text style={styles.error}>Could not save the audio style. Try again.</Text>
      ) : null}
      <TextField
        autoComplete="name"
        label="Name used in your greeting"
        onChangeText={setDraft}
        value={draft}
      />
      {nameError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {nameError}
        </Text>
      ) : null}
      <Button tone="light" disabled={savingName} onPress={() => void saveName()}>
        {savingName ? 'Saving…' : 'Save name'}
      </Button>
    </View>
  )
}
const styles = StyleSheet.create({
  section: { gap: t.space[3] },
  row: { flexDirection: 'row', gap: t.space[2] },
  text: { color: t.color.textSecondary, fontFamily: t.font.regular, fontSize: t.type.body },
  error: { color: t.color.error },
})
