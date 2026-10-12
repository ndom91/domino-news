import type { NotificationResponse } from 'expo-notifications'
import { isExpoGo } from './expo-go'

type StoryListener = (storySlug: string) => void
type Subscription = { remove: () => void }

const unavailableMessage = 'Background alerts require an installed development build.'

export const forYouAlertsAvailable = !isExpoGo

async function taskModule() {
  if (isExpoGo) throw new Error(unavailableMessage)
  return import('./for-you-alerts-task')
}

export async function forYouAlertsEnabled(): Promise<boolean> {
  if (isExpoGo) return false
  return (await taskModule()).forYouAlertsEnabled()
}

export async function enableForYouAlerts(): Promise<void> {
  await (await taskModule()).enableForYouAlerts()
}

export async function disableForYouAlerts(): Promise<void> {
  if (isExpoGo) return
  await (await taskModule()).disableForYouAlerts()
}

export async function listenForStoryNotifications(listener: StoryListener): Promise<Subscription> {
  if (isExpoGo) return { remove: () => {} }

  const Notifications = await import('expo-notifications')
  const handled = new Set<string>()
  const openStory = (response: NotificationResponse | null) => {
    const id = response?.notification.request.identifier
    const storySlug = response?.notification.request.content.data?.storySlug
    if (!id || handled.has(id) || typeof storySlug !== 'string') return
    handled.add(id)
    listener(storySlug)
  }

  void Notifications.getLastNotificationResponseAsync().then(async (response) => {
    openStory(response)
    if (response) await Notifications.clearLastNotificationResponseAsync()
  })
  return Notifications.addNotificationResponseReceivedListener(openStory)
}
