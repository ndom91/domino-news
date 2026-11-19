import { nativeTokens as t } from '@dn/design-tokens/native'
import Feather from '@expo/vector-icons/Feather'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

/** The same dark navigation bar for story screens and their design previews. */
export function StoryNavigation({
  headline,
  scrolled,
  onBack,
  onShare,
}: {
  headline: string
  scrolled: boolean
  onBack: () => void
  onShare: () => void
}) {
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.header}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          style={styles.button}
        >
          <Feather name="chevron-left" size={26} color={t.color.bandText} />
        </Pressable>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[styles.title, scrolled && styles.scrolled]}
        >
          {scrolled ? headline : 'Story'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share story"
          onPress={onShare}
          style={styles.button}
        >
          <Feather
            name={process.env.EXPO_OS === 'ios' ? 'share' : 'share-2'}
            size={20}
            color={t.color.bandText}
          />
        </Pressable>
      </View>
    </SafeAreaView>
  )
}
const styles = StyleSheet.create({
  header: { backgroundColor: t.color.band },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: t.space[2],
  },
  button: { alignItems: 'center', height: t.size.tap, justifyContent: 'center', width: t.size.tap },
  title: {
    color: t.color.bandText,
    fontFamily: t.font.black,
    fontSize: t.type.body,
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
  },
  scrolled: { fontFamily: t.font.condensed, textAlign: 'left' },
})
