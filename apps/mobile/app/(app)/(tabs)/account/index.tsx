import { nativeTokens as t } from '@dn/design-tokens/native'
import { countryName, plural } from '@dn/domain'
import type { UserPreferences } from '@dn/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { type Href, useRouter } from 'expo-router'
import { useState } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'
import { DeleteAccount } from '../../../../components/account/delete-account'
import {
  PreferencesPage,
  SettingsGroup,
  SettingsPage,
  SettingsRow,
  settingsStyles as s,
} from '../../../../components/account/settings'
import { uiStyles } from '../../../../components/ui'
import { authClient } from '../../../../lib/auth-client'
import { disableForYouAlerts } from '../../../../lib/for-you-alerts'

export default function AccountScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const session = authClient.useSession()
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [contactError, setContactError] = useState<string | null>(null)
  const user = session.data?.user

  async function openContact(url: string) {
    setContactError(null)
    try {
      await Linking.openURL(url)
    } catch {
      setContactError('Could not open the link. Please email domino-wire@ndo.dev instead.')
    }
  }

  async function signOut() {
    setSigningOut(true)
    setSignOutError(null)
    try {
      await disableForYouAlerts()
    } catch (error) {
      setSigningOut(false)
      setSignOutError(
        error instanceof Error
          ? `Could not turn off alerts before signing out: ${error.message}`
          : 'Could not turn off alerts before signing out. Check your connection and try again.',
      )
      return
    }
    const result = await authClient.signOut()
    if (!result.error) {
      queryClient.clear()
      router.replace('/sign-in')
      return
    }
    setSigningOut(false)
    setSignOutError(result.error.message ?? 'Could not sign out. Try again.')
  }

  const open = (href: Href) => () => router.push(href)

  return (
    <PreferencesPage>
      {(settings) => (
        <SettingsPage>
          <View style={styles.hero}>
            <Text style={uiStyles.eyebrow}>Your reader profile</Text>
            <Text style={styles.heading}>Account</Text>
            <Text style={styles.name}>{user?.name ?? 'Reader'}</Text>
          </View>

          <SettingsGroup title="For You">
            <SettingsRow
              detail={feedSummary(settings)}
              icon="sliders"
              onPress={open('/account/feed')}
              title="Your feed"
            />
            <SettingsRow
              detail="Publishers and narratives"
              icon="bookmark"
              onPress={open('/account/following')}
              title="Following"
            />
            <SettingsRow
              detail="Signals and hidden stories"
              icon="thumbs-up"
              onPress={open('/account/learned')}
              title="Learned from feedback"
            />
            <SettingsRow
              detail={locationSummary(settings)}
              icon="map-pin"
              onPress={open('/account/location')}
              title="Location"
            />
          </SettingsGroup>

          <SettingsGroup title="App">
            <SettingsRow
              detail="New stories in For You"
              icon="bell"
              onPress={open('/account/alerts')}
              title="Notifications"
            />
            <SettingsRow
              detail={settings.audioBriefingStyle === 'radio' ? 'Radio show' : 'Professional'}
              icon="headphones"
              onPress={open('/account/audio')}
              title="Audio briefing"
            />
          </SettingsGroup>

          <SettingsGroup title="Privacy">
            <SettingsRow
              detail={settings.rememberReads ? 'On' : 'Off'}
              icon="clock"
              onPress={open('/account/history')}
              title="Reading history"
            />
          </SettingsGroup>

          <SettingsGroup title="Help">
            <SettingsRow
              detail="domino-wire@ndo.dev"
              kind="external"
              icon="mail"
              onPress={() => void openContact('mailto:domino-wire@ndo.dev')}
              title="Email us"
            />
            <SettingsRow
              kind="external"
              icon="message-circle"
              onPress={() => void openContact('https://domino-wire.ndo.dev/contact-us')}
              title="Contact page"
            />
          </SettingsGroup>
          {contactError ? (
            <Text accessibilityLiveRegion="polite" style={s.error}>
              {contactError}
            </Text>
          ) : null}

          <SettingsGroup title="Account">
            <SettingsRow
              disabled={signingOut}
              icon="log-out"
              kind="action"
              onPress={() => void signOut()}
              title={signingOut ? 'Signing out…' : 'Sign out'}
            />
            <DeleteAccount />
          </SettingsGroup>
          {signOutError ? (
            <Text accessibilityLiveRegion="polite" style={s.error}>
              {signOutError}
            </Text>
          ) : null}
        </SettingsPage>
      )}
    </PreferencesPage>
  )
}

function feedSummary(settings: UserPreferences) {
  const count = settings.regions.length + settings.desks.length + settings.topics.length
  if (count === 0) return 'Pick regions, desks and topics'
  return plural(count, 'pick')
}

function locationSummary(settings: UserPreferences) {
  const local = settings.locality
  if (local)
    return [local.city ?? local.county, countryName(local.country)].filter(Boolean).join(', ')
  return settings.country ? countryName(settings.country) : 'Not set'
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: t.color.band,
    gap: t.space[2],
    margin: -t.space[4],
    marginBottom: 0,
    padding: t.space[5],
  },
  heading: { color: t.color.bandText, fontFamily: t.font.black, fontSize: 42, letterSpacing: -1.5 },
  name: { color: t.color.bandMuted, fontFamily: t.font.semibold, fontSize: t.type.bodyLarge },
})
