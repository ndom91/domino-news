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

export async function forYouAlertsEnabled(): Promise<boolean> {
  return Boolean(await SecureStore.getItemAsync(PUSH_TOKEN_KEY))
}

export async function forYouAlertsStatus(): Promise<ForYouAlertsStatus> {
  const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY)
  if (!token) return { enabled: false, registered: false }

  const { registered } = await api.getPushSubscriptionStatus(token)
  return { enabled: true, registered }
}

/** Re-register an existing opt-in after app updates or server-side subscription loss. */
export async function syncForYouAlerts(): Promise<ForYouAlertsStatus> {
  if (!(await forYouAlertsEnabled())) return { enabled: false, registered: false }

  const projectId = expoProjectId()
  if (!projectId) throw new Error('Push notifications are not configured for this app.')
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data
  await saveToken(token)
  return { enabled: true, registered: true }
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

  const projectId = expoProjectId()
  if (!projectId) throw new Error('Push notifications are not configured for this app.')
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data
  await saveToken(token)
  return { enabled: true, registered: true }
}

export async function disableForYouAlerts(): Promise<void> {
  const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY)
  if (token) await removeToken(token)
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY)
}

export async function refreshForYouPushToken(token: string) {
  await saveToken(token)
}

async function saveToken(token: string) {
  await api.savePushSubscription({ token })
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token)
}

async function removeToken(token: string) {
  await api.removePushSubscription(token)
}

function expoProjectId() {
  return Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId
}
