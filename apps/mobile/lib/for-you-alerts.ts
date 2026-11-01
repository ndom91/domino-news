import type { NotificationResponse } from 'expo-notifications'
import { isExpoGo } from './expo-go'
import type { ForYouAlertsStatus } from './for-you-alerts-task'

type StoryListener = (storySlug: string) => void
type Subscription = { remove: () => void }

const unavailableMessage = 'Push alerts require an installed app build.'

export const forYouAlertsAvailable = !isExpoGo

async function taskModule() {
  if (isExpoGo) throw new Error(unavailableMessage)
  return import('./for-you-alerts-task')
}

export async function forYouAlertsEnabled(): Promise<boolean> {
  if (isExpoGo) return false
  return (await taskModule()).forYouAlertsEnabled()
}

export async function enableForYouAlerts(): Promise<ForYouAlertsStatus> {
  return (await taskModule()).enableForYouAlerts()
}

export async function forYouAlertsStatus(): Promise<ForYouAlertsStatus> {
  if (isExpoGo) return { enabled: false, registered: false }
  return (await taskModule()).forYouAlertsStatus()
}

export async function syncForYouAlerts(): Promise<ForYouAlertsStatus> {
  if (isExpoGo) return { enabled: false, registered: false }
  return (await taskModule()).syncForYouAlerts()
}

export async function disableForYouAlerts(): Promise<void> {
  if (isExpoGo) return
  await (await taskModule()).disableForYouAlerts()
}

export async function forgetForYouAlerts(): Promise<void> {
  if (isExpoGo) return
  await (await taskModule()).forgetForYouAlerts()
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

export async function listenForPushTokenChanges(): Promise<Subscription> {
  if (isExpoGo) return { remove: () => {} }
  const Notifications = await import('expo-notifications')
  return Notifications.addPushTokenListener(({ data }) => {
    void (async () => {
      try {
        await (await taskModule()).refreshForYouPushToken(data)
      } catch {}
    })()
  })
}
