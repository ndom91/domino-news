import { nativeTokens as t } from '@dn/design-tokens/native'
import { plural, shortRelative } from '@dn/domain'
import type { NarrativeListResponse } from '@dn/schemas'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'expo-router'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { cardStyles, DeskCard } from '../../../components/story-card'
import { MessageView, QueryScreen, Screen, uiStyles } from '../../../components/ui'
import { queries } from '../../../lib/api'

type Narrative = NarrativeListResponse['items'][number]

export default function NarrativesScreen() {
  const router = useRouter()
  const narratives = useQuery(queries.narratives())

  return (
    <QueryScreen loading="Loading narratives" query={narratives} title="Narratives are unavailable">
      {({ items }) => {
        const now = new Date(narratives.dataUpdatedAt).toISOString()
        return (
          <Screen>
            <FlatList
              contentContainerStyle={uiStyles.content}
              data={items}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              keyExtractor={(narrative) => narrative.id}
              ListEmptyComponent={
                <MessageView
                  detail="A narrative appears once several related stories are linked together."
                  title="No narratives yet"
                />
              }
              ListHeaderComponent={
                <View style={styles.header}>
                  <Text style={uiStyles.eyebrow}>Connected reporting</Text>
                  <Text style={styles.heading}>Narratives</Text>
                  <Text style={styles.intro}>
                    Follow connected stories over time, from what happened first to what followed.
                  </Text>
                  <Text accessibilityLiveRegion="polite" style={styles.count}>
                    {plural(items.length, 'narrative')}
                  </Text>
                </View>
              }
              ListHeaderComponentStyle={items.length ? styles.listHeader : undefined}
              refreshControl={
                <RefreshControl
                  onRefresh={async () => {
                    await narratives.refetch()
                  }}
                  refreshing={narratives.isRefetching}
                  tintColor={t.color.accentText}
                />
              }
              renderItem={({ item }) => (
                <NarrativeCard
                  narrative={item}
                  now={now}
                  onPress={() => router.push(`/narratives/${item.slug}`)}
                />
              )}
            />
          </Screen>
        )
      }}
    </QueryScreen>
  )
}

function NarrativeCard({
  narrative,
  now,
  onPress,
}: {
  narrative: Narrative
  now: string
  onPress: () => void
}) {
  return (
    <DeskCard desk={narrative.desk} kind="narrative" onPress={onPress} title={narrative.title}>
      <Text style={cardStyles.title}>{narrative.title}</Text>
      {narrative.description ? (
        <Text numberOfLines={3} style={cardStyles.summary}>
          {narrative.description}
        </Text>
      ) : null}
      <Text style={cardStyles.meta}>
        {plural(narrative.storyCount, 'story', 'stories')} · updated{' '}
        {shortRelative(narrative.updatedAt, new Date(now))}
      </Text>
    </DeskCard>
  )
}

const styles = StyleSheet.create({
  header: { gap: t.space[2] },
  heading: {
    color: t.color.text,
    fontFamily: t.font.black,
    fontSize: t.type.display,
    lineHeight: 39,
  },
  intro: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
    maxWidth: 360,
  },
  count: {
    color: t.color.textMuted,
    fontFamily: t.font.medium,
    fontSize: t.type.meta,
    marginTop: t.space[2],
  },
  listHeader: { marginBottom: t.space[6] },
  separator: { height: t.space[4] },
})
