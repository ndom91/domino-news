import { nativeTokens as t } from '@dn/design-tokens/native'
import Feather from '@expo/vector-icons/Feather'
import { useQuery } from '@tanstack/react-query'
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { Alert, Pressable, ScrollView, Share } from 'react-native'
import { StoryBackground } from '../../../components/story-detail/story-background'
import { StoryConnections } from '../../../components/story-detail/story-connections'
import { StoryHeader } from '../../../components/story-detail/story-header'
import { StoryReporting } from '../../../components/story-detail/story-reporting'
import { StoryUpdates } from '../../../components/story-detail/story-updates'
import { StoryLeanMeter } from '../../../components/story-lean'
import { Button, LoadingView, MessageView, Screen, uiStyles } from '../../../components/ui'
import { api, isUnauthorized, queries } from '../../../lib/api'
import { apiUrl } from '../../../lib/config'

export default function StoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const router = useRouter()
  const story = useQuery(queries.story(slug))
  const updates = useQuery(queries.storyUpdates(slug))
  const preferences = useQuery(queries.preferences())
  const storyId = story.data?.id

  useEffect(() => {
    if (storyId && preferences.data?.rememberReads) {
      void api.recordRead(storyId).catch(() => {})
    }
  }, [preferences.data?.rememberReads, storyId])

  if (story.isPending)
    return (
      <Screen>
        <LoadingView label="Loading story" />
      </Screen>
    )
  if (isUnauthorized(story.error)) return <Redirect href="/sign-in" />
  if (story.isError)
    return (
      <Screen>
        <MessageView
          detail="This story may no longer be available."
          title="Story unavailable"
          action={{ label: 'Try again', onPress: story.refetch }}
        />
      </Screen>
    )

  const data = story.data
  const shareStory = async () => {
    const url = `${apiUrl}/stories/${encodeURIComponent(data.slug)}`
    try {
      await Share.share(process.env.EXPO_OS === 'ios' ? { url } : { message: url })
    } catch {
      Alert.alert('Could not share this story', 'Please try again.')
    }
  }
  return (
    <Screen>
      <Stack.Screen
        options={{
          headerTitleAlign: 'center',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share story"
              onPress={() => void shareStory()}
              style={({ pressed }) => ({
                alignItems: 'center',
                backgroundColor: t.color.textSecondary,
                borderRadius: t.size.tap / 2,
                height: t.size.tap,
                justifyContent: 'center',
                opacity: pressed ? 0.72 : 1,
                width: t.size.tap,
              })}
            >
              <Feather
                name={process.env.EXPO_OS === 'ios' ? 'share' : 'share-2'}
                size={20}
                color={t.color.bandText}
              />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={uiStyles.content}>
        <StoryHeader key={data.id} story={data} />
        {updates.data ? <StoryUpdates items={updates.data.items} /> : null}
        {updates.isError ? (
          <Button tone="light" onPress={() => void updates.refetch()}>
            Retry story changes
          </Button>
        ) : null}
        <StoryLeanMeter mix={data.leanMix} />
        <StoryBackground entries={data.context} />
        <StoryReporting
          onPublisherPress={(publisherSlug) => router.push(`/publishers/${publisherSlug}`)}
          sources={data.sources}
          leanMix={data.leanMix}
        />
        <StoryConnections
          narrative={data.narratives[0]}
          onNarrativePress={(narrativeSlug) => router.push(`/narratives/${narrativeSlug}`)}
          onStoryPress={(storySlug) => router.push(`/stories/${storySlug}`)}
          primarySources={data.primarySources}
          related={data.related}
        />
      </ScrollView>
    </Screen>
  )
}
