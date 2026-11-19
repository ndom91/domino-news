import { StyleSheet, Text, View } from 'react-native'
import { type StoryTokens, useStoryTheme } from './story-theme'

export function SectionHeading({ children }: { children: string }) {
  const t = useStoryTheme()
  const styles = createStyles(t)
  return (
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={styles.title}>
        {children}
      </Text>
    </View>
  )
}

const createStyles = (t: StoryTokens) =>
  StyleSheet.create({
    heading: {
      alignItems: 'center',
      borderBottomColor: t.color.accent,
      borderBottomWidth: 3,
      flexDirection: 'row',
      gap: t.space[2],
      paddingBottom: t.space[3],
    },
    mark: { backgroundColor: t.color.accent, height: 18, width: 4 },
    title: {
      color: t.color.text,
      flexShrink: 1,
      fontFamily: t.font.condensed,
      fontSize: t.type.section,
      textTransform: 'uppercase',
    },
  })
