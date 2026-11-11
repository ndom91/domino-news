import { nativeTokens as t } from '@dn/design-tokens/native'
import Feather from '@expo/vector-icons/Feather'
import { useQuery } from '@tanstack/react-query'
import { Stack, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect } from 'react'
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StoryBackground } from '../../../components/story-detail/story-background'
import { StoryConnections } from '../../../components/story-detail/story-connections'
import { StoryHeader } from '../../../components/story-detail/story-header'
import { StoryReporting } from '../../../components/story-detail/story-reporting'
import { StoryUpdates } from '../../../components/story-detail/story-updates'
import { StoryLeanMeter } from '../../../components/story-lean'
import { Button, QueryScreen, Screen, uiStyles } from '../../../components/ui'
import { api, queries } from '../../../lib/api'
import { apiUrl } from '../../../lib/config'

export default function StoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const router = useRouter()
  // A story page under another screen stops polling for context; it refetches when shown again.
  const focused = useIsFocused()
  const story = useQuery({ ...queries.story(slug), subscribed: focused })
  const updates = useQuery(queries.storyUpdates(slug))
  const preferences = useQuery(queries.preferences())
  const storyId = story.data?.id

  useEffect(() => {
    if (storyId && preferences.data?.rememberReads) {
      void api.recordRead(storyId).catch(() => {})
    }
  }, [preferences.data?.rememberReads, storyId])

  return (
    <>
      <Stack.Screen
        options={{
          header: () => (
            <SafeAreaView edges={['top', 'left', 'right']} style={styles.header}>
              <View style={styles.headerRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
                  style={styles.headerButton}
                >
                  <Feather name="chevron-left" size={26} color={t.color.bandText} />
                </Pressable>
                <Text accessibilityRole="header" style={styles.headerTitle}>
                  Story
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Share story"
                  onPress={() => void shareStory(story.data?.slug ?? slug)}
                  style={styles.headerButton}
                >
                  <Feather
                    name={process.env.EXPO_OS === 'ios' ? 'share' : 'share-2'}
                    size={20}
                    color={t.color.bandText}
                  />
                </Pressable>
              </View>
            </SafeAreaView>
          ),
        }}
      />
      <QueryScreen
        detail="This story may no longer be available."
        loading="Loading story"
        query={story}
        title="Story unavailable"
      >
        {(data) => (
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
        )}
      </QueryScreen>
    </>
  )
}

const styles = StyleSheet.create({
  header: { backgroundColor: t.color.band },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: t.space[2],
  },
  headerButton: {
    alignItems: 'center',
    height: t.size.tap,
    justifyContent: 'center',
    width: t.size.tap,
  },
  headerTitle: { color: t.color.bandText, fontFamily: t.font.black, fontSize: t.type.body },
})

async function shareStory(slug: string) {
  const url = `${apiUrl}/stories/${encodeURIComponent(slug)}`
  try {
    await Share.share(process.env.EXPO_OS === 'ios' ? { url } : { message: url })
  } catch {
    Alert.alert('Could not share this story', 'Please try again.')
  }
}
