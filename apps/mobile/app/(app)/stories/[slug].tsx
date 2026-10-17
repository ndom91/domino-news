import { nativeTokens as t } from '@dn/design-tokens/native'
import { useQuery } from '@tanstack/react-query'
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { StoryBackground } from '../../../components/story-detail/story-background'
import { StoryConnections } from '../../../components/story-detail/story-connections'
import { StoryHeader } from '../../../components/story-detail/story-header'
import { StoryReporting } from '../../../components/story-detail/story-reporting'
import { StoryLeanMeter } from '../../../components/story-lean'
import { LoadingView, MessageView, Screen, uiStyles } from '../../../components/ui'
import { api, isUnauthorized, queries } from '../../../lib/api'

export default function StoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const router = useRouter()
  const story = useQuery(queries.story(slug))
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
        <StoryHeader story={data} />
        <StoryLeanMeter country={preferences.data?.country ?? null} mix={data.leanMix} />
        {preferences.isError ? (
          <View style={styles.preferenceError}>
            <Text accessibilityLiveRegion="polite" style={styles.preferenceErrorText}>
              Your country preference could not load, so publisher context may not match your
              setting.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => preferences.refetch()}
              style={({ pressed }) => [styles.retry, pressed ? styles.pressed : null]}
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}
        <StoryBackground entries={data.context} />
        <StoryReporting
          onPublisherPress={(publisherSlug) => router.push(`/publishers/${publisherSlug}`)}
          sources={data.sources}
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

const styles = StyleSheet.create({
  preferenceError: { gap: t.space[2], marginTop: t.space[4] },
  preferenceErrorText: { color: t.color.error, fontFamily: t.font.medium, fontSize: t.type.meta },
  retry: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: t.size.tap },
  retryText: { color: t.color.accentText, fontFamily: t.font.bold, fontSize: t.type.meta },
  pressed: { opacity: 0.7 },
})
