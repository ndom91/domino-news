import { nativeTokens as t } from '@dn/design-tokens/native'
import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export function Screen({ children, top = false }: { children: ReactNode; top?: boolean }) {
  return (
    <SafeAreaView edges={top ? ['top', 'left', 'right'] : ['left', 'right']} style={styles.screen}>
      {children}
    </SafeAreaView>
  )
}

export function Button({
  children,
  onPress,
  disabled = false,
  tone = 'dark',
  accessibilityLabel,
}: {
  children: string
  onPress: () => void
  disabled?: boolean
  tone?: 'dark' | 'light'
  accessibilityLabel?: string
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? children}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'light' ? styles.buttonLight : styles.buttonDark,
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.buttonPressed : null,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          tone === 'light' ? styles.buttonTextLight : styles.buttonTextDark,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  )
}

export function LoadingView({ label = 'Loading' }: { label?: string }) {
  return (
    <View accessibilityLabel={label} accessibilityRole="progressbar" style={styles.state}>
      <ActivityIndicator color={t.color.accentText} />
      <Text style={styles.stateText}>{label}…</Text>
    </View>
  )
}

export function MessageView({
  title,
  detail,
  action,
}: {
  title: string
  detail: string
  action?: { label: string; onPress: () => void }
}) {
  return (
    <View style={styles.message}>
      <Text style={styles.messageTitle}>{title}</Text>
      <Text style={styles.messageDetail}>{detail}</Text>
      {action ? (
        <Button tone="light" onPress={action.onPress}>
          {action.label}
        </Button>
      ) : null}
    </View>
  )
}

export const uiStyles = StyleSheet.create({
  eyebrow: {
    color: t.color.textMuted,
    fontFamily: t.font.bold,
    fontSize: t.type.meta,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  label: {
    color: t.color.textSecondary,
    fontFamily: t.font.bold,
    fontSize: t.type.label,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  content: { flexGrow: 1, padding: t.space[4], paddingBottom: t.space[12] },
})

const styles = StyleSheet.create({
  screen: { backgroundColor: t.color.canvas, flex: 1 },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: t.size.tap,
    paddingHorizontal: t.space[4],
  },
  buttonDark: { backgroundColor: t.color.band },
  buttonLight: { borderColor: t.color.rule, borderWidth: 1, backgroundColor: t.color.surface },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.72 },
  buttonText: { fontFamily: t.font.bold, fontSize: t.type.body },
  buttonTextDark: { color: t.color.bandText },
  buttonTextLight: { color: t.color.text },
  state: { alignItems: 'center', flex: 1, gap: t.space[3], justifyContent: 'center' },
  stateText: { color: t.color.textMuted, fontFamily: t.font.medium, fontSize: t.type.body },
  message: { gap: t.space[3], padding: t.space[6] },
  messageTitle: { color: t.color.text, fontFamily: t.font.bold, fontSize: t.type.headline },
  messageDetail: {
    color: t.color.textSecondary,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    lineHeight: t.type.body * t.lineHeight.body,
  },
})
