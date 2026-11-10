import { nativeTokens as t } from '@dn/design-tokens/native'
import { countryName, formatDate, plural } from '@dn/domain'
import {
  FUNDING_LABELS,
  LEAN_LABELS,
  type PublisherAssessment,
  RELIABILITY_LABELS,
} from '@dn/schemas'
import { useQuery } from '@tanstack/react-query'
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { MutePublisher } from '../../../components/account/muted-publishers'
import { FollowToggle } from '../../../components/follow-toggle'
import { PublisherLogo } from '../../../components/publisher-logo'
import { StoryCard } from '../../../components/story-card'
import { openExternalLink } from '../../../components/story-detail/open-external-link'
import { LoadingView, MessageView, Screen, uiStyles } from '../../../components/ui'
import { isUnauthorized, queries } from '../../../lib/api'

export default function PublisherScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>()
  const router = useRouter()
  const publisher = useQuery(queries.publisher(slug))

  if (publisher.isPending) {
    return (
      <Screen>
        <LoadingView label="Loading publisher" />
      </Screen>
    )
  }
  if (isUnauthorized(publisher.error)) return <Redirect href="/sign-in" />
  if (publisher.isError) {
    return (
      <Screen>
        <MessageView
          action={{ label: 'Try again', onPress: publisher.refetch }}
          detail="This publisher may no longer be available."
          title="Publisher unavailable"
        />
      </Screen>
    )
  }

  const data = publisher.data
  const now = new Date(publisher.dataUpdatedAt).toISOString()
  const languageLabel = data.languages.length ? data.languages.join(', ') : null

  return (
    <Screen>
      <Stack.Screen options={{ title: data.name }} />
      <ScrollView contentContainerStyle={uiStyles.content}>
        <Text style={uiStyles.eyebrow}>Publisher</Text>
        <View style={styles.titleRow}>
          <View style={styles.titleLockup}>
            <PublisherLogo size={48} slug={data.slug} />
            <Text style={styles.title}>{data.name}</Text>
          </View>
          <FollowToggle name={data.name} targetId={data.id} targetType="publisher" />
        </View>
        <Pressable
          accessibilityHint="Opens the publisher website"
          accessibilityLabel={`Open ${data.domain}`}
          accessibilityRole="link"
          onPress={() => void openExternalLink(`https://${data.domain}`)}
          style={({ pressed }) => [styles.domainLink, pressed ? styles.pressed : null]}
        >
          <Text style={styles.domain}>{data.domain}</Text>
        </Pressable>
        <Text style={styles.metadata}>
          {[
            data.countryCode ? countryName(data.countryCode) : 'International',
            languageLabel,
            data.kind === 'official' ? 'Official source' : 'Newsroom',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <MutePublisher id={data.id} name={data.name} />

        <View style={styles.counts}>
          <Count label="Stories" value={data.storiesCovered} />
          <Count label="First reports" value={data.firstReports} />
          <Count label="Articles seen" value={data.articleCount} />
        </View>

        <Section title="Assessment">
          <Assessment assessment={data.assessment} />
        </Section>

        <Section title="Source use">
          <Text style={styles.body}>
            {data.bodyPolicy === 'metadata_only'
              ? 'Headlines and descriptions only'
              : 'Article text processed, not stored'}
          </Text>
          {data.policyNote ? <Text style={styles.body}>{data.policyNote}</Text> : null}
          {data.license ? <Text style={styles.meta}>Licence: {data.license}</Text> : null}
          {data.policyReviewedAt ? (
            <Text style={styles.meta}>Reviewed {formatDate(data.policyReviewedAt)}</Text>
          ) : null}
        </Section>

        <Section title="Often covers the same stories as">
          {data.coCoverage.length === 0 ? (
            <Text style={styles.empty}>No shared stories yet.</Text>
          ) : (
            data.coCoverage.map((coverage) => (
              <Pressable
                accessibilityHint="Opens this publisher"
                accessibilityLabel={coverage.publisher.name}
                accessibilityRole="link"
                key={coverage.publisher.id}
                onPress={() => router.push(`/publishers/${coverage.publisher.slug}`)}
                style={({ pressed }) => [styles.coverage, pressed ? styles.pressed : null]}
              >
                <View style={styles.coverageTitle}>
                  <PublisherLogo size={28} slug={coverage.publisher.slug} />
                  <Text style={styles.coverageName}>{coverage.publisher.name}</Text>
                </View>
                <Text style={styles.coverageCount}>
                  {plural(coverage.sharedStories, 'shared story')}
                </Text>
              </Pressable>
            ))
          )}
        </Section>

        <Section title={`Recent stories with ${data.name}`}>
          {data.recentStories.length === 0 ? (
            <Text style={styles.empty}>No published stories yet.</Text>
          ) : (
            <View style={styles.stories}>
              {data.recentStories.map((story) => (
                <StoryCard key={story.id} now={now} story={story} />
              ))}
            </View>
          )}
        </Section>
      </ScrollView>
    </Screen>
  )
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.count}>
      <Text style={styles.countLabel}>{label}</Text>
      <Text style={styles.countValue}>{value}</Text>
    </View>
  )
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <Text style={uiStyles.label}>{title}</Text>
      {children}
    </View>
  )
}

function Assessment({ assessment }: { assessment: PublisherAssessment | null }) {
  if (!assessment) return <Text style={styles.empty}>Not assessed yet.</Text>

  const lean = assessment.lean ? LEAN_LABELS[assessment.lean] : 'Not rated'
  const funding = assessment.fundingModel ? FUNDING_LABELS[assessment.fundingModel] : 'Not stated'
  const reliability = assessment.reliabilityLevel
    ? RELIABILITY_LABELS[assessment.reliabilityLevel]
    : 'Not rated'

  return (
    <View style={styles.assessment}>
      <Text style={styles.body}>Ownership: {assessment.ownership}</Text>
      <Text style={styles.body}>Funding: {funding}</Text>
      <Text style={styles.body}>Reliability: {reliability}</Text>
      <Text style={styles.body}>
        Political lean: {lean}
        {assessment.leanBasis === 'estimated' ? ' (estimated)' : ''}
      </Text>
      <Text style={styles.meta}>Reviewed {formatDate(assessment.reviewedAt)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: t.space[3],
    marginTop: t.space[2],
  },
  titleLockup: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: t.space[3] },
  title: {
    color: t.color.text,
    flex: 1,
    fontFamily: t.font.black,
    fontSize: 34,
    letterSpacing: -0.8,
    lineHeight: 35,
  },
  domainLink: {
    alignSelf: 'flex-start',
    marginTop: t.space[3],
    minHeight: t.size.tap,
    justifyContent: 'center',
  },
  domain: { color: t.color.accentText, fontFamily: t.font.bold, fontSize: t.type.body },
  metadata: {
    color: t.color.textMuted,
    fontFamily: t.font.regular,
    fontSize: t.type.meta,
    marginTop: t.space[2],
  },
  counts: {
    borderTopColor: t.color.rule,
    borderTopWidth: 2,
    flexDirection: 'row',
    marginTop: t.space[8],
  },
  count: {
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flex: 1,
    gap: t.space[1],
    paddingVertical: t.space[3],
  },
  countLabel: {
    color: t.color.textMuted,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    textTransform: 'uppercase',
  },
  countValue: { color: t.color.text, fontFamily: t.font.black, fontSize: t.type.headline },
  section: { gap: t.space[3], marginTop: t.space[10] },
  body: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
  },
  meta: { color: t.color.textMuted, fontFamily: t.font.medium, fontSize: t.type.meta },
  empty: { color: t.color.textMuted, fontFamily: t.font.regular, fontSize: t.type.body },
  assessment: { gap: t.space[2] },
  coverage: {
    borderBottomColor: t.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: t.space[1],
    paddingVertical: t.space[3],
  },
  coverageTitle: { alignItems: 'center', flexDirection: 'row', gap: t.space[2] },
  coverageName: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.body },
  coverageCount: { color: t.color.textMuted, fontFamily: t.font.regular, fontSize: t.type.meta },
  stories: { gap: t.space[5] },
  pressed: { opacity: 0.7 },
})
