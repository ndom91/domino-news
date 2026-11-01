import { nativeTokens as t } from '@dn/design-tokens/native'
import { useQueryClient } from '@tanstack/react-query'
import { Redirect, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button } from '../components/ui'
import { authClient } from '../lib/auth-client'
import { hasApiUrl } from '../lib/config'
import { requestGoogleIdToken, supportsGoogleSignIn } from '../lib/google-sign-in'

// Matches minPasswordLength in packages/server/src/auth.ts.
const MIN_PASSWORD_LENGTH = 10

export default function SignInScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const session = authClient.useSession()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<'password' | 'google' | null>(null)
  const signingUp = mode === 'sign-up'
  const isPending = pending !== null

  if (session.data) return <Redirect href="/" />

  async function signIn() {
    if (!hasApiUrl) {
      setError('Set EXPO_PUBLIC_API_URL before signing in.')
      return
    }
    setPending('password')
    setError(null)
    const result = await authClient.signIn.username({ username: username.trim(), password })
    if (result.error) {
      setPending(null)
      setError(
        result.error.status === 401
          ? 'Username or password is incorrect.'
          : (result.error.message ?? 'Sign-in failed. Try again.'),
      )
      return
    }
    queryClient.clear()
    router.replace('/')
  }

  async function signUp() {
    if (!hasApiUrl) {
      setError('Set EXPO_PUBLIC_API_URL before signing in.')
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    setPending('password')
    setError(null)
    // The server stores a placeholder when email is blank and uses the username as the name.
    const name = username.trim()
    const result = await authClient.signUp.email({
      username: name,
      password,
      email: email.trim(),
      name,
    })
    if (result.error) {
      setPending(null)
      setError(result.error.message ?? 'Could not create the account. Try again.')
      return
    }
    queryClient.clear()
    router.replace('/')
  }

  function switchMode() {
    setMode(signingUp ? 'sign-in' : 'sign-up')
    setError(null)
    setPassword('')
  }

  const submit = signingUp ? signUp : signIn
  const passwordPending = pending === 'password'
  let intro = 'Sign in with your username and password.'
  let submitLabel = passwordPending ? 'Signing in…' : 'Sign in'
  if (signingUp) {
    intro = 'Pick a username and password. Email is optional.'
    submitLabel = passwordPending ? 'Creating account…' : 'Create account'
  } else if (supportsGoogleSignIn) {
    intro = 'Sign in with your username or continue with Google.'
  }

  async function signInWithGoogle() {
    if (!hasApiUrl) {
      setError('Set EXPO_PUBLIC_API_URL before signing in.')
      return
    }

    setPending('google')
    setError(null)
    try {
      const token = await requestGoogleIdToken()
      if (!token) {
        setPending(null)
        return
      }

      const result = await authClient.signIn.social({
        provider: 'google',
        idToken: { token },
      })
      if (result.error) {
        setPending(null)
        setError(result.error.message ?? 'Google sign-in failed. Try again.')
        return
      }

      queryClient.clear()
      router.replace('/')
    } catch {
      setPending(null)
      setError('Google sign-in could not be completed. Try again.')
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.select({ android: 'height', ios: 'padding' })}
        style={styles.keyboard}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.masthead}>
            <Text style={styles.brand}>
              DOMINO<Text style={styles.dot}>.</Text>
            </Text>
            <Text style={styles.tagline}>One story, every source, and what came next.</Text>
          </View>
          <View style={styles.form}>
            <Text accessibilityRole="header" style={styles.heading}>
              {signingUp ? 'Create an account' : 'Sign in'}
            </Text>
            <Text style={styles.intro}>{intro}</Text>
            <View style={styles.fields}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                accessibilityLabel="Username"
                autoCapitalize="none"
                autoComplete={signingUp ? 'username-new' : 'username'}
                autoCorrect={false}
                editable={!isPending}
                onChangeText={setUsername}
                onSubmitEditing={submit}
                placeholder="Username"
                placeholderTextColor={t.color.textMuted}
                spellCheck={false}
                style={styles.input}
                value={username}
              />
              {signingUp ? (
                <Text style={styles.hint}>
                  3–30 letters, numbers, dots or underscores. You sign in with it.
                </Text>
              ) : null}
              {signingUp ? (
                <>
                  <Text style={styles.label}>Email (optional)</Text>
                  <TextInput
                    accessibilityLabel="Email (optional)"
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    editable={!isPending}
                    inputMode="email"
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    onSubmitEditing={submit}
                    placeholder="you@example.com"
                    placeholderTextColor={t.color.textMuted}
                    spellCheck={false}
                    style={styles.input}
                    value={email}
                  />
                  <Text style={styles.hint}>Only used to contact you about your account.</Text>
                </>
              ) : null}
              <Text style={styles.label}>Password</Text>
              <TextInput
                accessibilityLabel="Password"
                autoComplete={signingUp ? 'new-password' : 'current-password'}
                editable={!isPending}
                onChangeText={setPassword}
                onSubmitEditing={submit}
                placeholder="Password"
                placeholderTextColor={t.color.textMuted}
                secureTextEntry
                style={styles.input}
                value={password}
              />
              {signingUp ? (
                <Text style={styles.hint}>
                  At least {MIN_PASSWORD_LENGTH} characters. There’s no password reset yet, so keep
                  it safe.
                </Text>
              ) : null}
            </View>
            {error ? (
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                {error}
              </Text>
            ) : null}
            <Button
              disabled={isPending || username.trim().length === 0 || password.length === 0}
              onPress={submit}
            >
              {submitLabel}
            </Button>
            {supportsGoogleSignIn ? (
              <>
                <View style={styles.divider}>
                  <View style={styles.rule} />
                  <Text style={styles.or}>or</Text>
                  <View style={styles.rule} />
                </View>
                <Button disabled={isPending} onPress={signInWithGoogle} tone="light">
                  {pending === 'google' ? 'Connecting to Google…' : 'Continue with Google'}
                </Button>
              </>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={isPending}
              hitSlop={8}
              onPress={switchMode}
              style={styles.switch}
            >
              <Text style={styles.switchText}>
                {signingUp ? 'Already have an account? ' : 'New to Domino Wire? '}
                <Text style={styles.switchLink}>{signingUp ? 'Sign in' : 'Create an account'}</Text>
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: { backgroundColor: t.color.canvas, flex: 1 },
  keyboard: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'space-between' },
  masthead: {
    backgroundColor: t.color.band,
    gap: t.space[3],
    minHeight: '40%',
    justifyContent: 'flex-end',
    padding: t.space[6],
  },
  brand: { color: t.color.bandText, fontFamily: t.font.black, fontSize: 52, letterSpacing: -2 },
  dot: { color: t.color.accent },
  tagline: {
    color: t.color.bandText,
    fontFamily: t.font.semibold,
    fontSize: t.type.bodyLarge,
    lineHeight: 25,
    maxWidth: 280,
  },
  form: { gap: t.space[5], padding: t.space[6] },
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
  },
  fields: { gap: t.space[2] },
  label: {
    color: t.color.textSecondary,
    fontFamily: t.font.bold,
    fontSize: t.type.label,
    marginTop: t.space[2],
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
  hint: {
    color: t.color.textMuted,
    fontFamily: t.font.regular,
    fontSize: t.type.meta,
    lineHeight: 19,
  },
  switch: { alignItems: 'center', justifyContent: 'center', minHeight: t.size.tap },
  switchText: { color: t.color.textSecondary, fontFamily: t.font.regular, fontSize: t.type.body },
  switchLink: { color: t.color.text, fontFamily: t.font.bold, textDecorationLine: 'underline' },
  error: { color: t.color.error, fontFamily: t.font.medium, fontSize: t.type.body, lineHeight: 22 },
  divider: { alignItems: 'center', flexDirection: 'row', gap: t.space[3] },
  rule: { backgroundColor: t.color.border, flex: 1, height: StyleSheet.hairlineWidth },
  or: { color: t.color.textMuted, fontFamily: t.font.medium, fontSize: t.type.meta },
})
