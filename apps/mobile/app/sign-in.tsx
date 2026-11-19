import { nativeTokens as t } from '@dn/design-tokens/native'
import { useQueryClient } from '@tanstack/react-query'
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from 'expo-apple-authentication'
import { Redirect, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, TextField } from '../components/ui'
import {
  appleSignInError,
  requestAppleCredential,
  signInWithAppleCredential,
  useAppleSignInAvailable,
} from '../lib/apple-sign-in'
import { authClient } from '../lib/auth-client'
import { hasApiUrl } from '../lib/config'
import { requestGoogleIdToken, supportsGoogleSignIn } from '../lib/google-sign-in'

// Matches minPasswordLength in packages/server/src/auth.ts.
const MIN_PASSWORD_LENGTH = 10

export default function SignInScreen() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const session = authClient.useSession()
  const supportsAppleSignIn = useAppleSignInAvailable()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<SignInKind | null>(null)
  const signingUp = mode === 'sign-up'
  const isPending = pending !== null

  if (session.data) return <Redirect href="/" />

  /**
   * Every sign-in path: checks the API URL, shows the pressed button as pending, then opens the
   * app. `attempt` resolves to null once signed in, else to the error to show ('' shows none).
   */
  async function authenticate(kind: SignInKind, attempt: () => Promise<string | null>) {
    if (!hasApiUrl) {
      setError('Set EXPO_PUBLIC_API_URL before signing in.')
      return
    }
    setPending(kind)
    setError(null)
    // The auth client throws when the request never reaches the server.
    const failure = await attempt().catch(
      () => 'Could not reach Domino Wire. Check your connection and try again.',
    )
    if (failure === null) {
      queryClient.clear()
      router.replace('/')
      return
    }
    setPending(null)
    if (failure) setError(failure)
  }

  function signIn() {
    void authenticate('password', async () => {
      const { error } = await authClient.signIn.username({ username: username.trim(), password })
      if (!error) return null
      return error.status === 401
        ? 'Username or password is incorrect.'
        : (error.message ?? 'Sign-in failed. Try again.')
    })
  }

  function signUp() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    void authenticate('password', async () => {
      // The server stores a placeholder when email is blank and uses the username as the name.
      const name = username.trim()
      const { error } = await authClient.signUp.email({
        username: name,
        password,
        email: email.trim(),
        name,
      })
      return error ? (error.message ?? 'Could not create the account. Try again.') : null
    })
  }

  function signInWithGoogle() {
    void authenticate('google', async () => {
      try {
        const token = await requestGoogleIdToken()
        // No token: the reader closed Google's account picker.
        if (!token) return ''
        const { error } = await authClient.signIn.social({ provider: 'google', idToken: { token } })
        return error ? (error.message ?? 'Google sign-in failed. Try again.') : null
      } catch {
        return 'Google sign-in could not be completed. Try again.'
      }
    })
  }

  function signInWithApple() {
    void authenticate('apple', async () => {
      try {
        const credential = await requestAppleCredential()
        // No credential: the reader closed Apple's sheet.
        if (!credential) return ''
        const { error } = await signInWithAppleCredential(credential)
        return error ? appleSignInError(error) : null
      } catch {
        return 'Apple sign-in could not be completed. Try again.'
      }
    })
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
  } else if (supportsAppleSignIn || supportsGoogleSignIn) {
    const providers = [supportsAppleSignIn && 'Apple', supportsGoogleSignIn && 'Google']
    intro = `Sign in with your username, or continue with ${providers.filter(Boolean).join(' or ')}.`
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
              <TextField
                autoCapitalize="none"
                autoComplete={signingUp ? 'username-new' : 'username'}
                autoCorrect={false}
                editable={!isPending}
                hint={
                  signingUp
                    ? '3–30 letters, numbers, dots or underscores. You sign in with it.'
                    : undefined
                }
                label="Username"
                onChangeText={setUsername}
                onSubmitEditing={submit}
                placeholder="Username"
                spellCheck={false}
                value={username}
              />
              {signingUp ? (
                <TextField
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  editable={!isPending}
                  hint="Only used to contact you about your account."
                  inputMode="email"
                  keyboardType="email-address"
                  label="Email (optional)"
                  onChangeText={setEmail}
                  onSubmitEditing={submit}
                  placeholder="you@example.com"
                  spellCheck={false}
                  value={email}
                />
              ) : null}
              <TextField
                autoComplete={signingUp ? 'new-password' : 'current-password'}
                editable={!isPending}
                hint={
                  signingUp
                    ? `At least ${MIN_PASSWORD_LENGTH} characters. There’s no password reset yet, so keep it safe.`
                    : undefined
                }
                label="Password"
                onChangeText={setPassword}
                onSubmitEditing={submit}
                placeholder="Password"
                secureTextEntry
                value={password}
              />
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
            {supportsAppleSignIn || supportsGoogleSignIn ? (
              <View style={styles.divider}>
                <View style={styles.rule} />
                <Text style={styles.or}>or</Text>
                <View style={styles.rule} />
              </View>
            ) : null}
            {supportsAppleSignIn ? (
              // Apple's own button (required by its guidelines), first and full width so it's at
              // least as prominent as Google's. It has no disabled state, so pending dims it.
              <View
                accessibilityState={{ busy: pending === 'apple', disabled: isPending }}
                pointerEvents={isPending ? 'none' : 'auto'}
                style={isPending ? styles.applePending : null}
              >
                <AppleAuthenticationButton
                  buttonStyle={AppleAuthenticationButtonStyle.BLACK}
                  buttonType={
                    signingUp
                      ? AppleAuthenticationButtonType.SIGN_UP
                      : AppleAuthenticationButtonType.CONTINUE
                  }
                  cornerRadius={0}
                  onPress={signInWithApple}
                  style={styles.apple}
                />
              </View>
            ) : null}
            {supportsGoogleSignIn ? (
              <Button disabled={isPending} onPress={signInWithGoogle} tone="light">
                {pending === 'google' ? 'Connecting to Google…' : 'Continue with Google'}
              </Button>
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
            {__DEV__ ? (
              <Button tone="light" onPress={() => router.push('/dev/story-hero')}>
                Story design preview
              </Button>
            ) : null}
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
  fields: { gap: t.space[4] },
  switch: { alignItems: 'center', justifyContent: 'center', minHeight: t.size.tap },
  switchText: { color: t.color.textSecondary, fontFamily: t.font.regular, fontSize: t.type.body },
  switchLink: { color: t.color.text, fontFamily: t.font.bold, textDecorationLine: 'underline' },
  error: { color: t.color.error, fontFamily: t.font.medium, fontSize: t.type.body, lineHeight: 22 },
  divider: { alignItems: 'center', flexDirection: 'row', gap: t.space[3] },
  rule: { backgroundColor: t.color.border, flex: 1, height: StyleSheet.hairlineWidth },
  or: { color: t.color.textMuted, fontFamily: t.font.medium, fontSize: t.type.meta },
  apple: { height: t.size.tap, width: '100%' },
  applePending: { opacity: 0.45 },
})

type SignInKind = 'password' | 'google' | 'apple'
