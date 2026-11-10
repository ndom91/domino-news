import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { api } from './api'

const PUSH_TOKEN_KEY = 'dominonews.expo-push-token'
const CHANNEL_ID = 'for-you'

export type ForYouAlertsStatus = { enabled: boolean; registered: boolean }

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export async function forYouAlertsStatus(): Promise<ForYouAlertsStatus> {
  const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY)
  if (!token) return { enabled: false, registered: false }

  const { registered } = await api.getPushSubscriptionStatus(token)
  return { enabled: true, registered }
}

/** Re-register an existing opt-in after app updates or server-side subscription loss. */
export async function syncForYouAlerts(): Promise<ForYouAlertsStatus> {
  const optedIn = await SecureStore.getItemAsync(PUSH_TOKEN_KEY)
  return optedIn ? register() : { enabled: false, registered: false }
}

export async function enableForYouAlerts(): Promise<ForYouAlertsStatus> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      importance: Notifications.AndroidImportance.DEFAULT,
      name: 'For You',
    })
  }

  const permissions = await Notifications.getPermissionsAsync()
  const status = permissions.granted
    ? permissions.status
    : (await Notifications.requestPermissionsAsync()).status
  if (status !== 'granted')
    throw new Error('Allow notifications in your device settings to turn on alerts.')
  return register()
}

export async function disableForYouAlerts(): Promise<void> {
  const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY)
  if (token) await api.removePushSubscription(token)
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY)
}

/** Drop the local opt-in without calling the API, e.g. after the account was deleted. */
export async function forgetForYouAlerts(): Promise<void> {
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY)
}

/**
 * Saves this install's Expo push token on the server, then locally. The token comes from Expo:
 * the server accepts only ExponentPushToken[…], not the raw FCM/APNs device token.
 */
async function register(): Promise<ForYouAlertsStatus> {
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId
  if (!projectId) throw new Error('Push notifications are not configured for this app.')
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data
  await api.savePushSubscription({ token })
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token)
  return { enabled: true, registered: true }
}
