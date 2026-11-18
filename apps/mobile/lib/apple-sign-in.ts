import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { authClient } from './auth-client'
import { isExpoGo } from './expo-go'

// Expo Go signs in as Expo's own app, whose tokens the server rejects (wrong audience).
const canTryApple = Platform.OS === 'ios' && !isExpoGo

/** Sign in with Apple needs iOS 13+ and a build with the capability; check once per screen. */
export function useAppleSignInAvailable() {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    if (!canTryApple) return
    AppleAuthentication.isAvailableAsync().then(setAvailable, () => setAvailable(false))
  }, [])
  return available
}

export type AppleCredential = {
  /** Apple's stable user ID: the `accountId` of the account's Apple sign-in method. */
  user: string
  identityToken: string
  authorizationCode: string
  nonce: string
  firstName?: string
  lastName?: string
}

/** Opens Apple's sheet. Resolves to null when the reader cancels it. */
export async function requestAppleCredential(): Promise<AppleCredential | null> {
  // Apple embeds the hashed nonce in the identity token; the server gets the raw value and
  // checks that it hashes to the same thing, so a captured token can't be replayed.
  const nonce = Crypto.randomUUID()
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce)
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    })
    if (!credential.identityToken || !credential.authorizationCode)
      throw new Error('Apple did not return an identity token.')
    return {
      user: credential.user,
      identityToken: credential.identityToken,
      authorizationCode: credential.authorizationCode,
      nonce,
      firstName: credential.fullName?.givenName ?? undefined,
      lastName: credential.fullName?.familyName ?? undefined,
    }
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null
    throw error
  }
}

/**
 * Signs in (or up) through better-auth. Apple gives the name only on the first authorization,
 * so it's passed along every time; the server uses it only when it creates the account. The
 * authorization code lets the server store a token it can revoke when the account is deleted.
 */
export function signInWithAppleCredential(credential: AppleCredential) {
  const name =
    credential.firstName || credential.lastName
      ? { firstName: credential.firstName, lastName: credential.lastName }
      : undefined
  return authClient.signIn.social({
    provider: 'apple',
    idToken: {
      token: credential.identityToken,
      nonce: credential.nonce,
      ...(name ? { user: { name } } : {}),
    },
    // Not in better-auth's types; the server reads it in an after hook (packages/server/src/auth.ts).
    ...({ authorizationCode: credential.authorizationCode } as object),
  })
}

/** Error copy for a failed Apple sign-in, matching better-auth's error codes. */
export function appleSignInError(error: { code?: string; message?: string }) {
  if (error.code === 'OAUTH_LINK_ERROR')
    return 'An account with this email already exists. Sign in with your username and password.'
  return error.message ?? 'Apple sign-in failed. Try again.'
}
