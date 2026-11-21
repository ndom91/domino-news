import { nativeTokens as t } from '@dn/design-tokens/native'
import { useQuery } from '@tanstack/react-query'
import { Stack, useIsFocused, useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Alert, ScrollView, type ScrollViewInstance, Share, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StoryBackground } from '../../../components/story-detail/story-background'
import { StoryConnections } from '../../../components/story-detail/story-connections'
import { StoryHeader } from '../../../components/story-detail/story-header'
import { StoryNavigation } from '../../../components/story-detail/story-navigation'
import { StoryReporting } from '../../../components/story-detail/story-reporting'
import { useStoryTheme } from '../../../components/story-detail/story-theme'
import { StoryUpdates } from '../../../components/story-detail/story-updates'
import { WhoReported } from '../../../components/story-detail/who-reported'
import { StoryLeanMeter } from '../../../components/story-lean'
import { Button, QueryScreen } from '../../../components/ui'
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
  const theme = useStoryTheme()
  const scroll = useRef<ScrollViewInstance>(null)
  const heroHeight = useRef(0)
  const reportingY = useRef(0)
  const sectionsY = useRef(0)
  const [scrolled, setScrolled] = useState(false)
  const [reportRequest, setReportRequest] = useState(0)
  const [now] = useState(() => new Date().toISOString())

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
            <StoryNavigation
              headline={story.data?.title ?? 'Story'}
              scrolled={scrolled}
              onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              onShare={() => void shareStory(story.data?.slug ?? slug)}
            />
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
          <SafeAreaView
            edges={['left', 'right', 'bottom']}
            style={[styles.screen, { backgroundColor: theme.color.canvas }]}
          >
            <ScrollView
              ref={scroll}
              scrollEventThrottle={16}
              onScroll={(event) =>
                setScrolled(event.nativeEvent.contentOffset.y >= heroHeight.current)
              }
              contentContainerStyle={styles.content}
            >
              <StoryHeader
                key={data.id}
                story={data}
                now={now}
                onHeroLayout={(event) => {
                  heroHeight.current = event.nativeEvent.layout.height
                }}
              />
              <WhoReported
                sources={data.sources}
                now={now}
                onSeeReports={() => {
                  setReportRequest((request) => request + 1)
                  scroll.current?.scrollTo({ y: reportingY.current, animated: true })
                }}
              />
              <View
                style={styles.sections}
                onLayout={(event) => {
                  sectionsY.current = event.nativeEvent.layout.y
                }}
              >
                {updates.data ? <StoryUpdates items={updates.data.items} now={now} /> : null}
                {updates.isError ? (
                  <Button tone="light" onPress={() => void updates.refetch()}>
                    Retry story changes
                  </Button>
                ) : null}
                <StoryLeanMeter mix={data.leanMix} />
                <StoryBackground entries={data.context} />
                <View
                  onLayout={(event) => {
                    reportingY.current = sectionsY.current + event.nativeEvent.layout.y
                  }}
                />
                <StoryReporting
                  key={`${data.id}-${reportRequest}`}
                  showAll={reportRequest > 0}
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
              </View>
            </ScrollView>
          </SafeAreaView>
        )}
      </QueryScreen>
    </>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingBottom: t.space[12] },
  sections: { paddingHorizontal: t.space[4] },
})

async function shareStory(slug: string) {
  const url = `${apiUrl}/stories/${encodeURIComponent(slug)}`
  try {
    await Share.share(process.env.EXPO_OS === 'ios' ? { url } : { message: url })
  } catch {
    Alert.alert('Could not share this story', 'Please try again.')
  }
}
