import { nativeTokens as t } from '@dn/design-tokens/native'
import { Link, Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { storyHeroFixture, storyHeroNow, storyHeroStates } from '../../../../fixtures/story-hero'
import { SectionHeading } from '../../components/story-detail/section-heading'
import { StoryHeader } from '../../components/story-detail/story-header'
import { StoryNavigation } from '../../components/story-detail/story-navigation'
import { StoryReporting } from '../../components/story-detail/story-reporting'
import { StoryTheme } from '../../components/story-detail/story-theme'
import { WhoReported } from '../../components/story-detail/who-reported'

/** Development only: /dev/story-hero?state=long|extra|short|updating|dark, no account needed. */
export default function StoryHeroDevScreen() {
  const { state } = useLocalSearchParams<{ state?: string }>()
  const selected = storyHeroStates.find((item) => item === state) ?? 'long'
  const story = storyHeroFixture(selected)
  const router = useRouter()
  const scroll = useRef<ScrollViewInstance>(null)
  const reportingY = useRef(0)
  const heroHeight = useRef(0)
  const [scrolled, setScrolled] = useState(false)
  if (!__DEV__) return <Redirect href="/" />
  return (
    <StoryTheme value={selected === 'dark' ? 'dark' : 'light'}>
      <Stack.Screen
        options={{
          headerShown: true,
          header: () => (
            <StoryNavigation
              headline={story.title}
              scrolled={scrolled}
              onBack={() => router.back()}
              onShare={() => void Share.share({ message: story.title })}
            />
          ),
        }}
      />
      <SafeAreaView
        edges={['left', 'right', 'bottom']}
        style={[
          styles.screen,
          { backgroundColor: selected === 'dark' ? t.color.band : t.color.canvas },
        ]}
      >
        <ScrollView
          ref={scroll}
          onScroll={(event) => setScrolled(event.nativeEvent.contentOffset.y >= heroHeight.current)}
          scrollEventThrottle={16}
        >
          <StoryHeader
            key={selected}
            story={story}
            now={storyHeroNow}
            onHeroLayout={(event) => {
              heroHeight.current = event.nativeEvent.layout.height
            }}
          />
          <WhoReported
            sources={story.sources}
            now={storyHeroNow}
            onSeeReports={() => scroll.current?.scrollTo({ y: reportingY.current, animated: true })}
          />
          <View
            style={styles.controls}
            onLayout={(event) => {
              reportingY.current = event.nativeEvent.layout.y
            }}
          >
            {storyHeroStates.map((item) => (
              <StateLink key={item} state={item} />
            ))}
            <SectionHeading>What changed</SectionHeading>
            <StoryReporting
              sources={story.sources}
              leanMix={[]}
              showAll
              onPublisherPress={() => {}}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </StoryTheme>
  )
}

function StateLink({ state }: { state: string }) {
  return (
    <Link href={{ pathname: '/dev/story-hero', params: { state } }} asChild>
      <Pressable accessibilityRole="link" style={styles.control}>
        <Text style={styles.controlText}>{state}</Text>
      </Pressable>
    </Link>
  )
}
const styles = StyleSheet.create({
  screen: { flex: 1 },
  controls: { gap: t.space[3], padding: t.space[4], paddingBottom: t.space[12] },
  control: {
    backgroundColor: t.color.band,
    minHeight: t.size.tap,
    justifyContent: 'center',
    padding: t.space[3],
  },
  controlText: { color: t.color.bandText, fontFamily: t.font.bold },
})
