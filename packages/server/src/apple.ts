import { createPrivateKey, sign } from 'node:crypto'

/**
 * Sign in with Apple, server side. better-auth verifies the app's identity token but keeps no
 * Apple refresh token, and App Review requires revoking it when an account is deleted
 * (Guideline 5.1.1(v)). So the app also sends its one-time authorization code; we exchange it
 * for a refresh token at sign-in and revoke that token on deletion.
 */
export type AppleConfig = {
  /** The iOS bundle ID: the identity token audience and the client_id for token calls. */
  clientId: string
  teamId: string
  keyId: string
  /** The Sign in with Apple key (.p8, PKCS#8 PEM). */
  privateKey: string
}

const APPLE = 'https://appleid.apple.com'

/** Apple is enabled only with a signing key, so every Apple account can be revoked later. */
export function readAppleConfig(env: NodeJS.ProcessEnv): AppleConfig | null {
  const teamId = env.APPLE_TEAM_ID?.trim()
  const keyId = env.APPLE_KEY_ID?.trim()
  // Env files often hold the PEM on one line with literal \n.
  const privateKey = env.APPLE_PRIVATE_KEY?.trim().replace(/\\n/g, '\n')
  if (!teamId || !keyId || !privateKey) return null
  return {
    clientId: env.APPLE_BUNDLE_ID?.trim() || 'dev.ndo.dominonews',
    teamId,
    keyId,
    privateKey,
  }
}

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

/** The ES256 client secret JWT Apple wants on /auth/token and /auth/revoke. */
export function appleClientSecret(config: AppleConfig, now = Date.now()) {
  const iat = Math.floor(now / 1000)
  const input = `${base64url({ alg: 'ES256', kid: config.keyId })}.${base64url({
    iss: config.teamId,
    iat,
    exp: iat + 300,
    aud: APPLE,
    sub: config.clientId,
  })}`
  // JWS wants the raw r||s signature, not Node's default DER encoding.
  const signature = sign('sha256', Buffer.from(input), {
    key: createPrivateKey(config.privateKey),
    dsaEncoding: 'ieee-p1363',
  })
  return `${input}.${signature.toString('base64url')}`
}

async function post(config: AppleConfig, path: string, params: Record<string, string>) {
  return fetch(`${APPLE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: appleClientSecret(config),
      ...params,
    }),
    signal: AbortSignal.timeout(10_000),
  })
}

/**
 * Exchanges the app's authorization code (valid five minutes, single use) for a refresh token.
 * Returns the Apple user ID (`sub`) from the returned identity token so the caller can check it
 * belongs to the account it stores the token on. The token comes straight from Apple over TLS.
 */
export async function exchangeAppleCode(config: AppleConfig, code: string) {
  const res = await post(config, '/auth/token', { grant_type: 'authorization_code', code })
  if (!res.ok) throw new Error(`Apple token exchange failed: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { refresh_token?: string; id_token?: string }
  const payload = body.id_token?.split('.')[1]
  const sub = payload
    ? (JSON.parse(Buffer.from(payload, 'base64url').toString()) as { sub?: string }).sub
    : undefined
  if (!body.refresh_token || !sub) throw new Error('Apple token exchange returned no token')
  return { refreshToken: body.refresh_token, sub }
}

export async function revokeAppleToken(config: AppleConfig, refreshToken: string) {
  const res = await post(config, '/auth/revoke', {
    token: refreshToken,
    token_type_hint: 'refresh_token',
  })
  if (!res.ok) throw new Error(`Apple token revocation failed: ${res.status} ${await res.text()}`)
}

/**
 * Apple sends the reader's name only on the first authorization, and only to the app. Without
 * one, use the email's local part, unless it's a Hide My Email relay address (random letters).
 */
export function appleFallbackName(email: string | undefined) {
  const local = email?.split('@')[0]?.trim()
  if (!local || email?.toLowerCase().endsWith('@privaterelay.appleid.com')) return 'Reader'
  return local
}
