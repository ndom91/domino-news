import { AudioSettings } from '../../../../components/account/audio-settings'
import { PreferencesPage, SettingsPage } from '../../../../components/account/settings'
import { authClient } from '../../../../lib/auth-client'

export default function AudioSettingsScreen() {
  const session = authClient.useSession()
  return (
    <PreferencesPage>
      {(settings) => (
        <SettingsPage>
          <AudioSettings name={session.data?.user.name ?? ''} style={settings.audioBriefingStyle} />
        </SettingsPage>
      )}
    </PreferencesPage>
  )
}
