import { nativeTokens as t } from '@dn/design-tokens/native'
import { StyleSheet, Text, View } from 'react-native'

export function SectionHeading({ children }: { children: string }) {
  return (
    <View style={styles.heading}>
      <View aria-hidden style={styles.mark} />
      <Text accessibilityRole="header" style={styles.title}>
        {children}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  heading: {
    alignItems: 'center',
    borderTopColor: t.color.rule,
    borderTopWidth: 2,
    flexDirection: 'row',
    gap: t.space[2],
    paddingTop: t.space[3],
  },
  mark: { backgroundColor: t.color.accent, height: 18, width: 4 },
  title: {
    color: t.color.text,
    flexShrink: 1,
    fontFamily: t.font.black,
    fontSize: t.type.bodyLarge,
  },
})
