import { nativeTokens as t } from '@dn/design-tokens/native'
import { countryName } from '@dn/domain'
import type { LocalScope, Place } from '@dn/schemas'
import Feather from '@expo/vector-icons/Feather'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Redirect, useRouter } from 'expo-router'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { StoryCard } from '../../../components/story-card'
import { Button, LoadingView, MessageView, Screen, uiStyles } from '../../../components/ui'
import { isUnauthorized, queries } from '../../../lib/api'

function scopeTitle(scope: LocalScope, place: Place) {
  if (scope === 'city') return `In ${place.city}`
  if (scope === 'county') return `Across ${place.county}`
  return `${place.city || place.county ? 'Elsewhere in' : 'Across'} ${countryName(place.country)}`
}

export default function LocalScreen() {
  const router = useRouter()
  const feed = useInfiniteQuery(queries.local())
  if (feed.isPending)
    return (
      <Screen>
        <LoadingView label="Loading local stories" />
      </Screen>
    )
  if (isUnauthorized(feed.error)) return <Redirect href="/sign-in" />
  if (!feed.data)
    return (
      <Screen>
        <MessageView
          title="Local stories unavailable"
          detail="Check your connection, then try again."
          action={{ label: 'Try again', onPress: feed.refetch }}
        />
      </Screen>
    )
  const first = feed.data.pages[0]
  const items = feed.data.pages.flatMap((page) => page.items)
  const now = new Date(feed.dataUpdatedAt).toISOString()
  return (
    <Screen>
      <FlatList
        contentContainerStyle={uiStyles.content}
        data={items}
        keyExtractor={(item) => item.story.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={uiStyles.eyebrow}>News near you</Text>
            <View style={styles.titleRow}>
              <Text style={styles.heading}>Local</Text>
              {first?.source === 'saved' ? (
                <Pressable
                  accessibilityLabel="Edit your location"
                  accessibilityHint="Opens Account settings"
                  accessibilityRole="button"
                  onPress={() => router.push('/account')}
                  style={({ pressed }) => [styles.settings, pressed && styles.pressed]}
                >
                  <Feather name="settings" size={20} color={t.color.textSecondary} />
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.text}>Stories from your city, local area and country.</Text>
            {first?.source === 'request' && first.locality ? (
              <Text style={styles.text}>
                Showing {countryName(first.locality.country)} from your current connection. This
                location is not saved.
              </Text>
            ) : null}
            {first?.source !== 'saved' ? (
              <Button tone="light" onPress={() => router.push('/account')}>
                Set your location
              </Button>
            ) : null}
            {feed.isRefetchError ? (
              <Text style={styles.text}>Couldn’t refresh. Showing saved results.</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <MessageView
            title={first?.locality ? 'No local stories yet' : 'Set your location'}
            detail={
              first?.locality
                ? 'New reporting will appear here when its location matches.'
                : 'Choose a country in Account to see local stories.'
            }
          />
        }
        ListFooterComponent={
          feed.hasNextPage || feed.isFetchNextPageError ? (
            <View style={styles.header}>
              <Button disabled={feed.isFetchingNextPage} onPress={() => void feed.fetchNextPage()}>
                {feed.isFetchingNextPage
                  ? 'Loading…'
                  : feed.isFetchNextPageError
                    ? 'Try again'
                    : 'Show more local stories'}
              </Button>
            </View>
          ) : undefined
        }
        refreshControl={
          <RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} />
        }
        renderItem={({ item, index }) => (
          <View style={styles.item}>
            {first?.locality && (index === 0 || items[index - 1]?.scope !== item.scope) ? (
              <Text style={uiStyles.label}>{scopeTitle(item.scope, first.locality)}</Text>
            ) : null}
            <StoryCard story={item.story} now={now} />
          </View>
        )}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { gap: t.space[3], marginBottom: t.space[5] },
  titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  settings: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: t.size.tap,
    minWidth: t.size.tap,
  },
  pressed: { opacity: 0.7 },
  heading: { color: t.color.text, fontFamily: t.font.black, fontSize: t.type.display },
  text: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: 22,
  },
  item: { gap: t.space[3], marginBottom: t.space[5] },
})
