import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { authClient } from './auth-client'
import { apiUrl } from './config'

const PUSH_TOKEN_KEY = 'dominonews.expo-push-token'
const CHANNEL_ID = 'for-you'

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

/** Re-register an existing opt-in after app updates or server-side subscription loss. */
export async function syncForYouAlerts(): Promise<void> {
  if (!(await forYouAlertsEnabled())) return

  const projectId = expoProjectId()
  if (!projectId) throw new Error('Push notifications are not configured for this app.')
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data
  await saveToken(token)
}

export async function enableForYouAlerts(): Promise<void> {
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
  await request('/me/push-subscriptions', { method: 'POST', body: JSON.stringify({ token }) })
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token)
}

async function removeToken(token: string) {
  await request('/me/push-subscriptions/remove', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

function expoProjectId() {
  return Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId
}

async function request(path: string, init: RequestInit) {
  const cookie = await authClient.getCookie()
  if (!cookie || !apiUrl) throw new Error('Sign in again to update notifications.')
  const response = await fetch(`${apiUrl}/api/v1${path}`, {
    ...init,
    headers: { cookie, 'content-type': 'application/json' },
  })
  if (!response.ok) throw new Error('Could not update notifications. Try again.')
}
