import { nativeTokens as t } from '@dn/design-tokens/native'
import { DESK_SLOT, type Desk } from '@dn/schemas'
import { Redirect } from 'expo-router'
import type { ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { isUnauthorized } from '../lib/api'

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

/**
 * A text input in the shared field style. A `label` shows above it and also names it for screen
 * readers; a `hint` shows below it.
 */
export function TextField({
  label,
  hint,
  style,
  ...input
}: TextInputProps & { label?: string; hint?: string }) {
  const field = (
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={t.color.textMuted}
      {...input}
      style={[styles.input, style]}
    />
  )
  if (!label && !hint) return field
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      {field}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  )
}

/** A desk's fill and the text colour that reads on it; the neutral slot until a story has a desk. */
export function deskColors(desk: Desk | null): { fill: string; ink: string } {
  const slot = desk ? DESK_SLOT[desk] : 0
  return {
    fill: t.color.narrative[slot] ?? t.color.narrative[0],
    ink: t.color.narrativeText[slot] ?? t.color.narrativeText[0],
  }
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
    <View accessibilityRole="alert" style={styles.message}>
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

/** What QueryScreen needs from a query or infinite query result. */
type ScreenQuery<T> = {
  data: T | undefined
  error: unknown
  isPending: boolean
  refetch: () => Promise<unknown>
}

/**
 * A data screen's loading, signed-out and error states. The error replaces the screen only
 * before the first data arrives: a failed refetch (such as a story's 15-second poll) keeps
 * what the reader is looking at.
 */
export function QueryScreen<T>({
  query,
  loading,
  title,
  detail = 'Check your connection, then try again.',
  top = false,
  children,
}: {
  query: ScreenQuery<T>
  loading: string
  title: string
  detail?: string
  top?: boolean
  children: (data: T) => ReactNode
}) {
  if (isUnauthorized(query.error)) return <Redirect href="/sign-in" />
  if (query.data !== undefined) return children(query.data)
  return (
    <Screen top={top}>
      {query.isPending ? (
        <LoadingView label={loading} />
      ) : (
        <MessageView
          action={{ label: 'Try again', onPress: () => void query.refetch() }}
          detail={detail}
          title={title}
        />
      )}
    </Screen>
  )
}

/** The footer of a paged list: loads the next page, and offers a retry when one fails. */
export function LoadMoreFooter({
  query,
  label,
}: {
  query: {
    hasNextPage: boolean
    isFetchingNextPage: boolean
    isFetchNextPageError: boolean
    fetchNextPage: () => Promise<unknown>
  }
  label: string
}) {
  if (!query.hasNextPage && !query.isFetchNextPageError) return null
  let buttonLabel = label
  if (query.isFetchNextPageError) buttonLabel = 'Try again'
  if (query.isFetchingNextPage) buttonLabel = 'Loading…'
  return (
    <View style={styles.more}>
      <Button disabled={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()}>
        {buttonLabel}
      </Button>
      {query.isFetchNextPageError ? (
        <Text accessibilityRole="alert" style={styles.pageError}>
          Couldn’t load more stories. Try again.
        </Text>
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
    color: t.color.text,
    fontFamily: t.font.black,
    fontSize: t.type.body,
    letterSpacing: 0.8,
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
  field: { gap: t.space[2] },
  fieldLabel: { color: t.color.textSecondary, fontFamily: t.font.bold, fontSize: t.type.label },
  fieldHint: {
    color: t.color.textMuted,
    fontFamily: t.font.regular,
    fontSize: t.type.meta,
    lineHeight: 19,
  },
  input: {
    backgroundColor: t.color.surface,
    borderColor: t.color.borderStrong,
    borderWidth: 1,
    color: t.color.text,
    fontFamily: t.font.regular,
    fontSize: t.type.body,
    minHeight: t.size.tap,
    paddingHorizontal: t.space[3],
  },
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
  more: { gap: t.space[2], marginTop: t.space[6] },
  pageError: { color: t.color.error, fontFamily: t.font.medium, fontSize: t.type.meta },
})
