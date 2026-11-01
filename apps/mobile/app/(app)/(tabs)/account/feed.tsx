import { Text, View } from 'react-native'
import { MutedPublishers } from '../../../../components/account/muted-publishers'
import {
  PreferencesPage,
  SettingsPage,
  settingsStyles as s,
  useSavePreferences,
} from '../../../../components/account/settings'
import { FeedPicks } from '../../../../components/feed-picks'

export default function FeedSettingsScreen() {
  const save = useSavePreferences()
  return (
    <PreferencesPage>
      {(settings) => (
        <SettingsPage>
          <View style={s.section}>
            <Text style={s.description}>
              Stories matching these move to the top of For You. Nothing else is hidden.
            </Text>
            <FeedPicks
              disabled={save.isPending}
              onChange={(update) => save.mutate(update)}
              sections={['regions', 'desks', 'topics']}
              values={settings}
            />
            {save.isError ? (
              <Text accessibilityLiveRegion="polite" style={s.error}>
                Your picks could not be saved. Try again.
              </Text>
            ) : null}
          </View>
          <MutedPublishers />
        </SettingsPage>
      )}
    </PreferencesPage>
  )
}
