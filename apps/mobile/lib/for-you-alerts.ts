import { forYouResponseSchema } from '@dn/schemas'
import * as BackgroundTask from 'expo-background-task'
import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'
import * as TaskManager from 'expo-task-manager'
import { Platform } from 'react-native'
import { authClient } from './auth-client'
import { apiUrl } from './config'

const TASK_NAME = 'domino-for-you-alerts'
const STORY_IDS_KEY = 'dominonews.for-you-alert-story-ids'
const CHANNEL_ID = 'for-you'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const cookie = await authClient.getCookie()
    if (!cookie || !apiUrl) return BackgroundTask.BackgroundTaskResult.Success

    const response = await fetch(`${apiUrl}/api/v1/for-you?limit=5`, { headers: { cookie } })
    const data = forYouResponseSchema.safeParse(await response.json())
    if (!response.ok || !data.success) return BackgroundTask.BackgroundTaskResult.Failed

    const previous = JSON.parse((await SecureStore.getItemAsync(STORY_IDS_KEY)) ?? '[]') as string[]
    const storyIds = data.data.items.map((item) => item.story.id)
    await SecureStore.setItemAsync(STORY_IDS_KEY, JSON.stringify(storyIds))

    const newest = data.data.items.find((item) => !previous.includes(item.story.id))
    if (previous.length > 0 && newest) {
      await Notifications.scheduleNotificationAsync({
        content: {
          body: newest.story.summary ?? 'A new story is ready in your personal feed.',
          data: { storySlug: newest.story.slug },
          title: 'New for you',
        },
        trigger: null,
      })
    }
    return BackgroundTask.BackgroundTaskResult.Success
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed
  }
})

export async function forYouAlertsEnabled(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(TASK_NAME)
}

export async function enableForYouAlerts(): Promise<void> {
  if (!(await TaskManager.isAvailableAsync())) {
    throw new Error('Background alerts require an installed development build.')
  }
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

  if (!(await TaskManager.isTaskRegisteredAsync(TASK_NAME))) {
    await BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: 15 })
  }
}

export async function disableForYouAlerts(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(TASK_NAME)) {
    await BackgroundTask.unregisterTaskAsync(TASK_NAME)
  }
  await SecureStore.deleteItemAsync(STORY_IDS_KEY)
}
