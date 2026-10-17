import { nativeTokens as t } from '@dn/design-tokens/native'
import { plural, shortRelative } from '@dn/domain'
import { DESK_LABELS, DESK_SLOT, type NarrativeListResponse } from '@dn/schemas'
import { useQuery } from '@tanstack/react-query'
import { Redirect, useRouter } from 'expo-router'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { LoadingView, MessageView, Screen, uiStyles } from '../../../components/ui'
import { isUnauthorized, queries } from '../../../lib/api'

type Narrative = NarrativeListResponse['items'][number]

export default function NarrativesScreen() {
  const router = useRouter()
  const narratives = useQuery(queries.narratives())

  if (narratives.isPending) {
    return (
      <Screen>
        <LoadingView label="Loading narratives" />
      </Screen>
    )
  }
  if (isUnauthorized(narratives.error)) return <Redirect href="/sign-in" />
  if (narratives.isError && !narratives.data) {
    return (
      <Screen>
        <MessageView
          action={{ label: 'Try again', onPress: narratives.refetch }}
          detail="Check your connection, then try again."
          title="Narratives are unavailable"
        />
      </Screen>
    )
  }

  const now = new Date().toISOString()

  return (
    <Screen>
      <FlatList
        contentContainerStyle={uiStyles.content}
        data={narratives.data.items}
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
              {plural(narratives.data.items.length, 'narrative')}
            </Text>
          </View>
        }
        ListHeaderComponentStyle={narratives.data.items.length ? styles.listHeader : undefined}
        refreshControl={
          <RefreshControl
            onRefresh={narratives.refetch}
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
  const slot = narrative.desk ? DESK_SLOT[narrative.desk] : 0
  const keyColor = t.color.narrative[slot] ?? t.color.narrative[0]
  const keyText = t.color.narrativeText[slot] ?? t.color.narrativeText[0]

  return (
    <Pressable
      accessibilityHint="Opens this narrative"
      accessibilityLabel={narrative.title}
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      <View style={[styles.bar, { backgroundColor: keyColor }]}>
        <Text numberOfLines={1} style={[styles.barText, { color: keyText }]}>
          {narrative.desk ? DESK_LABELS[narrative.desk] : 'Narrative'}
        </Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{narrative.title}</Text>
        {narrative.description ? (
          <Text numberOfLines={3} style={styles.description}>
            {narrative.description}
          </Text>
        ) : null}
        <Text style={styles.meta}>
          {plural(narrative.storyCount, 'story', 'stories')} · updated{' '}
          {shortRelative(narrative.updatedAt, new Date(now))}
        </Text>
      </View>
    </Pressable>
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
  card: {
    backgroundColor: t.color.surface,
    borderColor: t.color.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bar: { justifyContent: 'center', minHeight: 28, paddingHorizontal: t.space[3] },
  barText: {
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  cardBody: { gap: t.space[2], padding: t.space[4] },
  cardTitle: { color: t.color.text, fontFamily: t.font.black, fontSize: 24, lineHeight: 25 },
  description: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 23,
  },
  meta: { color: t.color.textMuted, fontFamily: t.font.medium, fontSize: t.type.meta },
  pressed: { opacity: 0.7 },
})
