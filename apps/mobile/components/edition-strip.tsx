import { nativeTokens as t } from '@dn/design-tokens/native'
import { longDate, plural } from '@dn/domain'
import { useQuery } from '@tanstack/react-query'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { queries } from '../lib/api'

export function EditionStrip() {
  const edition = useQuery(queries.edition())
  const stats = edition.data?.stats
  const date = edition.data ? longDate(edition.data.editionAt) : 'Domino Wire'

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.strip}>
        <Text style={styles.wordmark}>
          DOMINO<Text style={styles.dot}>.</Text>
        </Text>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.date}>
            {date}
          </Text>
          {stats ? (
            <Text numberOfLines={1} style={styles.stats}>
              {plural(stats.stories, 'story')} · {plural(stats.publishers, 'publisher')}
            </Text>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: t.color.band },
  strip: {
    alignItems: 'center',
    backgroundColor: t.color.band,
    flexDirection: 'row',
    gap: t.space[3],
    minHeight: 44,
    paddingHorizontal: t.space[4],
  },
  wordmark: {
    color: t.color.bandText,
    flexShrink: 0,
    fontFamily: t.font.black,
    fontSize: 19,
    letterSpacing: -0.8,
  },
  dot: { color: t.color.accent },
  copy: { alignItems: 'flex-end', flex: 1 },
  date: {
    color: t.color.bandText,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    textAlign: 'right',
  },
  stats: {
    color: t.color.bandMuted,
    fontFamily: t.font.medium,
    fontSize: 11,
    textAlign: 'right',
  },
})
