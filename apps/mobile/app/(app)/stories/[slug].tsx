import { useQuery } from '@tanstack/react-query'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { ScrollView } from 'react-native'
import { StoryBackground } from '../../../components/story-detail/story-background'
import { StoryConnections } from '../../../components/story-detail/story-connections'
import { StoryHeader } from '../../../components/story-detail/story-header'
import { StoryReporting } from '../../../components/story-detail/story-reporting'
import { StoryUpdates } from '../../../components/story-detail/story-updates'
import { StoryLeanMeter } from '../../../components/story-lean'
import { Button, LoadingView, MessageView, Screen, uiStyles } from '../../../components/ui'
import { api, isUnauthorized, queries } from '../../../lib/api'

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
  return (
    <Screen>
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
