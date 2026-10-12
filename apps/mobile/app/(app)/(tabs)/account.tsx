import { nativeTokens as t } from '@dn/design-tokens/native'
import { plural } from '@dn/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Redirect, useRouter } from 'expo-router'
import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Button, LoadingView, MessageView, Screen, uiStyles } from '../../../components/ui'
import { isUnauthorized, queries } from '../../../lib/api'
import { authClient } from '../../../lib/auth-client'

export default function AccountScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const session = authClient.useSession()
  const preferences = useQuery(queries.preferences())
  const [pending, setPending] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const user = session.data?.user

  async function signOut() {
    setPending(true)
    setSignOutError(null)
    const result = await authClient.signOut()
    if (!result.error) {
      queryClient.clear()
      router.replace('/sign-in')
      return
    }
    setPending(false)
    setSignOutError(result.error.message ?? 'Could not sign out. Try again.')
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
          detail="Check your connection, then try again."
          title="Account is unavailable"
          action={{ label: 'Try again', onPress: preferences.refetch }}
        />
      </Screen>
    )
  }

  const settings = preferences.data
  return (
    <Screen>
      <ScrollView contentContainerStyle={uiStyles.content}>
        <Text style={styles.heading}>Account</Text>
        <View style={styles.identity}>
          <Text style={uiStyles.eyebrow}>Signed in as</Text>
          <Text style={styles.name}>{user?.name ?? 'Reader'}</Text>
        </View>
        <View style={styles.section}>
          <Text style={uiStyles.label}>Your reading settings</Text>
          <Setting
            label="Regions"
            value={settings.regions.length ? settings.regions.join(', ') : 'None selected'}
          />
          <Setting
            label="Desks"
            value={settings.desks.length ? settings.desks.join(', ') : 'None selected'}
          />
          <Setting
            label="Topics"
            value={
              settings.topics.length ? plural(settings.topics.length, 'topic') : 'None selected'
            }
          />
          <Setting label="Reading history" value={settings.rememberReads ? 'On' : 'Off'} />
        </View>
        <Text style={styles.note}>
          Preference editing and your reading insights are next in the mobile app. They remain
          available on the web today.
        </Text>
        {signOutError ? (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {signOutError}
          </Text>
        ) : null}
        <Button disabled={pending} onPress={signOut}>
          {pending ? 'Signing out…' : 'Sign out'}
        </Button>
      </ScrollView>
    </Screen>
  )
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.setting}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  heading: {
    color: t.color.text,
    fontFamily: t.font.black,
    fontSize: t.type.display,
    lineHeight: 39,
  },
  identity: {
    borderBottomColor: t.color.rule,
    borderBottomWidth: 2,
    gap: t.space[2],
    marginTop: t.space[6],
    paddingBottom: t.space[4],
  },
  name: { color: t.color.text, fontFamily: t.font.black, fontSize: t.type.headline },
  section: { gap: t.space[3], marginTop: t.space[8] },
  setting: {
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: t.space[1],
    paddingBottom: t.space[3],
  },
  settingLabel: {
    color: t.color.textMuted,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  settingValue: {
    color: t.color.textSecondary,
    fontFamily: t.font.medium,
    fontSize: t.type.body,
    lineHeight: 22,
  },
  note: {
    color: t.color.textMuted,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
    marginVertical: t.space[8],
  },
  error: { color: t.color.error, fontFamily: t.font.medium, fontSize: t.type.body, lineHeight: 22 },
})
