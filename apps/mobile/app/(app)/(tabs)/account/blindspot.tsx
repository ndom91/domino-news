import { nativeTokens as t } from '@dn/design-tokens/native'
import {
  countryName,
  ONE_SIDED_MIN_RATED,
  ONE_SIDED_SHARE,
  plural,
  readingGapLabel,
} from '@dn/domain'
import { savePreferencesMutation } from '@dn/queries'
import type { Insights } from '@dn/schemas'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { StoryCard } from '../../../../components/story-card'
import { Button, QueryScreen, Screen, uiStyles } from '../../../../components/ui'
import { api, queries } from '../../../../lib/api'

export default function BlindspotScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const insights = useQuery(queries.insights())
  const enableHistory = useMutation(savePreferencesMutation(api, queryClient))

  return (
    <QueryScreen loading="Loading Blindspot" query={insights} title="Blindspot is unavailable">
      {(data) => {
        const now = new Date(insights.dataUpdatedAt).toISOString()
        return (
          <Screen>
            <ScrollView contentContainerStyle={uiStyles.content}>
              <View style={styles.hero}>
                <Text style={uiStyles.eyebrow}>Your reading, in context</Text>
                <Text style={styles.heading}>Blindspot</Text>
                {data.enabled ? (
                  <Text style={styles.heroDetail}>{plural(data.readCount, 'story read')}</Text>
                ) : (
                  <Text style={styles.heroDetail}>Reading history is off</Text>
                )}
              </View>

              {!data.enabled ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>See what you miss</Text>
                  <Text style={styles.description}>
                    Blindspot uses only the stories you open to show new developments in narratives
                    you read and regions or desks you rarely read. It never guesses your politics.
                  </Text>
                  <Text style={styles.note}>Stories you open are kept for 30 days.</Text>
                  <Button
                    disabled={enableHistory.isPending}
                    onPress={() => enableHistory.mutate({ rememberReads: true })}
                  >
                    {enableHistory.isPending ? 'Turning on history…' : 'Remember what I read'}
                  </Button>
                  {enableHistory.isError ? (
                    <Text accessibilityLiveRegion="polite" style={styles.error}>
                      Couldn’t turn on reading history. Try again.
                    </Text>
                  ) : null}
                </View>
              ) : (
                <ReadingInsights
                  data={data}
                  now={now}
                  onManageHistory={() => router.navigate('/account/history')}
                />
              )}

              <OneSidedCoverage data={data.oneSided} now={now} />
            </ScrollView>
          </Screen>
        )
      }}
    </QueryScreen>
  )
}

function ReadingInsights({
  data,
  now,
  onManageHistory,
}: {
  data: Insights
  now: string
  onManageHistory: () => void
}) {
  const hasInsights = data.missedDevelopments.length > 0 || data.gaps.length > 0

  return (
    <>
      {!hasInsights ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nothing to show yet</Text>
          <Text style={styles.description}>
            Open a few stories, and this page will show new developments in the narratives you read
            and the regions or desks you rarely read.
          </Text>
        </View>
      ) : null}

      {data.missedDevelopments.length > 0 ? (
        <View style={styles.section}>
          <Text style={uiStyles.label}>Since you last read</Text>
          {data.missedDevelopments.map(({ narrative, stories }) => (
            <View key={narrative.id} style={styles.narrative}>
              <Text style={styles.narrativeTitle}>{narrative.title}</Text>
              <Text style={styles.caption}>
                {plural(stories.length, 'new development')} since you last read this narrative
              </Text>
              {stories.map((story) => (
                <StoryCard key={story.id} now={now} story={story} />
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {data.gaps.length > 0 ? (
        <View style={styles.section}>
          <Text style={uiStyles.label}>You rarely read</Text>
          <View style={styles.gaps}>
            {data.gaps.map((gap) => (
              <View key={`${gap.kind}-${gap.key}`} style={styles.gap}>
                <Text style={styles.gapTitle}>{readingGapLabel(gap)}</Text>
                <Text style={styles.caption}>
                  {plural(gap.storiesThisWeek, 'story', 'stories')} this week ·{' '}
                  {gap.yourReads === 0 ? 'none read by you' : `${gap.yourReads} read by you`}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.historyNote}>
        <Text style={styles.note}>Based on stories you opened in the last 30 days.</Text>
        <Button onPress={onManageHistory} tone="light">
          Manage reading history
        </Button>
      </View>
    </>
  )
}

function OneSidedCoverage({ data, now }: { data: Insights['oneSided']; now: string }) {
  const country = data.country ? countryName(data.country) : null

  return (
    <View style={styles.section}>
      <Text style={uiStyles.label}>
        {country ? `Covered mostly by one side in ${country}` : 'Covered mostly by one side'}
      </Text>
      <Text style={styles.description}>
        Stories from this week where at least {ONE_SIDED_MIN_RATED} rated publishers cover them and{' '}
        {Math.round(ONE_SIDED_SHARE * 100)}% or more lean the same way. Lean is relative to that
        country’s media.
      </Text>
      {data.stories.length === 0 ? (
        <Text style={styles.note}>
          {country
            ? `No one-sided stories in ${country} this week.`
            : 'No stories this week have enough rated publishers yet.'}
        </Text>
      ) : (
        data.stories.map(({ story, lean }) => {
          const rated = lean.publishers.filter((publisher) => publisher.lean).length
          return (
            <View key={story.id} style={styles.oneSidedStory}>
              <Text style={styles.oneSidedCaption}>
                {lean.oneSided ? `Mostly ${lean.oneSided}-leaning` : 'Mixed coverage'} · {rated} of{' '}
                {plural(lean.publishers.length, 'publisher')} rated
              </Text>
              <StoryCard now={now} story={story} />
            </View>
          )
        })
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: t.color.band,
    gap: t.space[2],
    margin: -t.space[4],
    padding: t.space[5],
  },
  heading: { color: t.color.bandText, fontFamily: t.font.black, fontSize: 42, letterSpacing: -1.5 },
  heroDetail: { color: t.color.bandMuted, fontFamily: t.font.semibold, fontSize: t.type.bodyLarge },
  section: { gap: t.space[4], marginTop: t.space[8] },
  sectionTitle: { color: t.color.text, fontFamily: t.font.black, fontSize: t.type.headline },
  description: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
  },
  note: {
    color: t.color.textMuted,
    fontFamily: t.font.medium,
    fontSize: t.type.meta,
    lineHeight: 18,
  },
  error: { color: t.color.error, fontFamily: t.font.medium, fontSize: t.type.body, lineHeight: 22 },
  narrative: { gap: t.space[3] },
  narrativeTitle: { color: t.color.text, fontFamily: t.font.black, fontSize: t.type.headline },
  caption: {
    color: t.color.textMuted,
    fontFamily: t.font.medium,
    fontSize: t.type.meta,
    lineHeight: 18,
  },
  gaps: { gap: t.space[4] },
  gap: { borderTopColor: t.color.rule, borderTopWidth: 2, gap: t.space[1], paddingTop: t.space[3] },
  gapTitle: { color: t.color.text, fontFamily: t.font.black, fontSize: t.type.bodyLarge },
  historyNote: { gap: t.space[3], marginTop: t.space[8] },
  oneSidedStory: { gap: t.space[2] },
  oneSidedCaption: {
    color: t.color.textMuted,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    textTransform: 'uppercase',
  },
})
