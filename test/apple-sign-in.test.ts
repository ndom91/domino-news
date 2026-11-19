import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
  sign,
  verify,
} from 'node:crypto'
import { createDb, createPool } from '@dn/db'
import { type Auth, createAuth, createUserAccount } from '@dn/server/auth'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appleClientSecret,
  appleFallbackName,
  readAppleConfig,
} from '../packages/server/src/apple.ts'
import { readConfig } from '../packages/server/src/config.ts'
import { truncateAll } from './harness.ts'

// Sign in with Apple against a stand-in for appleid.apple.com: identity tokens are signed with a
// local key, and the token, revoke and keys endpoints are mocked through fetch.
const bundleId = 'dev.ndo.dominonews'
const pem = (key: KeyObject) => key.export({ format: 'pem', type: 'pkcs8' }).toString()
const appleKey = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const identityKey = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const env = {
  ...process.env,
  APPLE_TEAM_ID: 'TEAM123456',
  APPLE_KEY_ID: 'KEY1234567',
  // As it usually sits in .env: one line with literal \n.
  APPLE_PRIVATE_KEY: pem(appleKey.privateKey).replace(/\n/g, '\\n'),
}

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
function jwt(payload: object, key = identityKey.privateKey) {
  const input = `${b64({ alg: 'ES256', kid: 'test-kid' })}.${b64(payload)}`
  const signature = sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' })
  return `${input}.${signature.toString('base64url')}`
}
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

function identityToken(sub: string, email: string, nonce: string) {
  const now = Math.floor(Date.now() / 1000)
  return jwt({
    iss: 'https://appleid.apple.com',
    aud: bundleId,
    sub,
    email,
    email_verified: true,
    nonce: sha256(nonce),
    iat: now,
    exp: now + 600,
  })
}

let pool: ReturnType<typeof createPool>
let auth: Auth
const servicesId = 'dev.ndo.dominonews.web'
const webEnv = { ...env, APPLE_SERVICES_ID: servicesId }
let apple: {
  tokenRequests: URLSearchParams[]
  /** Each revoke request: the token and the client that sent it. */
  revoked: { token: string; clientId: string }[]
  /** Clients whose revoke requests Apple rejects. */
  failRevokeFor: string[]
}
const realFetch = globalThis.fetch

function post(path: string, body: unknown, token?: string, instance = auth) {
  return instance.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  )
}

/** What the iOS app sends: the identity token, the raw nonce, the code and the first-time name. */
function signInWithApple(
  sub: string,
  email: string,
  extra: { name?: { firstName?: string; lastName?: string }; nonce?: string } = {},
) {
  const nonce = 'raw-nonce'
  return post('/sign-in/social', {
    provider: 'apple',
    idToken: {
      token: identityToken(sub, email, nonce),
      nonce: extra.nonce ?? nonce,
      ...(extra.name ? { user: { name: extra.name } } : {}),
    },
    authorizationCode: `code-for-${sub}`,
  })
}

const userByEmail = async (email: string) =>
  (await pool.query('select id, name from auth_user where email = $1', [email])).rows[0] as
    | { id: string; name: string }
    | undefined

beforeAll(async () => {
  pool = createPool()
  auth = createAuth(createDb(pool), env)
})

beforeEach(() => {
  apple = { tokenRequests: [], revoked: [], failRevokeFor: [] }
  const jwk = {
    ...createPublicKey(identityKey.privateKey).export({ format: 'jwk' }),
    kid: 'test-kid',
    alg: 'ES256',
  }
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url === 'https://appleid.apple.com/auth/keys') return Response.json({ keys: [jwk] })
    if (url === 'https://appleid.apple.com/auth/token') {
      const params = new URLSearchParams(String(init?.body))
      apple.tokenRequests.push(params)
      const sub = params.get('code')?.replace('code-for-', '') ?? ''
      const now = Math.floor(Date.now() / 1000)
      const idToken = jwt({
        iss: 'https://appleid.apple.com',
        aud: params.get('client_id'),
        sub,
        email: `${sub}@example.com`,
        email_verified: true,
        iat: now,
        exp: now + 600,
      })
      return Response.json({
        access_token: `access-${sub}`,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: `refresh-${sub}`,
        id_token: idToken,
      })
    }
    if (url === 'https://appleid.apple.com/auth/revoke') {
      const params = new URLSearchParams(String(init?.body))
      const clientId = params.get('client_id') ?? ''
      apple.revoked.push({ token: params.get('token') ?? '', clientId })
      return new Response(null, { status: apple.failRevokeFor.includes(clientId) ? 400 : 200 })
    }
    return realFetch(input, init)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

afterAll(async () => {
  if (pool) {
    await truncateAll({ pool })
    await pool.end()
  }
})

describe('Apple client secret', () => {
  it('is an ES256 JWT for the team, key and bundle ID that the key verifies', () => {
    const config = readAppleConfig(env)
    if (!config) throw new Error('expected an Apple config')
    const [header, payload, signature] = appleClientSecret(
      config,
      bundleId,
      1_700_000_000_000,
    ).split('.')
    expect(JSON.parse(Buffer.from(header ?? '', 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'KEY1234567',
    })
    expect(JSON.parse(Buffer.from(payload ?? '', 'base64url').toString())).toEqual({
      iss: 'TEAM123456',
      iat: 1_700_000_000,
      exp: 1_700_000_300,
      aud: 'https://appleid.apple.com',
      sub: bundleId,
    })
    const valid = verify(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      { key: appleKey.publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature ?? '', 'base64url'),
    )
    expect(valid).toBe(true)
  })

  it('signs for the client it is given', () => {
    const config = readAppleConfig(webEnv)
    if (!config) throw new Error('expected an Apple config')
    expect(config.webClientId).toBe(servicesId)
    const payload = appleClientSecret(config, servicesId).split('.')[1] ?? ''
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString()).sub).toBe(servicesId)
  })

  it('needs the team ID, key ID and private key', () => {
    expect(readAppleConfig({ ...env, APPLE_KEY_ID: '' })).toBeNull()
    expect(readAppleConfig({ ...env, APPLE_PRIVATE_KEY: undefined })).toBeNull()
    expect(readAppleConfig({ ...env, APPLE_BUNDLE_ID: 'com.example.app' })?.clientId).toBe(
      'com.example.app',
    )
  })

  it('falls back to the email name, but never to a Hide My Email address', () => {
    expect(appleFallbackName('ada@example.com')).toBe('ada')
    expect(appleFallbackName('x7k2p9@privaterelay.appleid.com')).toBe('Reader')
    expect(appleFallbackName(undefined)).toBe('Reader')
  })
})

describe('Sign in with Apple', () => {
  it('is not offered without the Apple env vars', async () => {
    const withoutApple = createAuth(createDb(pool), { ...env, APPLE_PRIVATE_KEY: '' })
    const res = await post(
      '/sign-in/social',
      { provider: 'apple', idToken: { token: 'x' } },
      undefined,
      withoutApple,
    )
    expect(res.status).toBe(404)
  })

  it('creates the account with the name from the app and stores a refresh token', async () => {
    const res = await signInWithApple('apple-ada', 'ada@example.com', {
      name: { firstName: 'Ada', lastName: 'Lovelace' },
    })
    expect(res.status).toBe(200)
    const user = await userByEmail('ada@example.com')
    expect(user?.name).toBe('Ada Lovelace')
    expect(apple.tokenRequests[0]?.get('client_id')).toBe(bundleId)
    expect(apple.tokenRequests[0]?.get('grant_type')).toBe('authorization_code')
    const { rows } = await pool.query(
      `select account_id, refresh_token from auth_account where user_id = $1 and provider_id = 'apple'`,
      [user?.id],
    )
    expect(rows).toEqual([{ account_id: 'apple-ada', refresh_token: 'refresh-apple-ada' }])

    // Later sign-ins carry no name and keep the stored one.
    expect((await signInWithApple('apple-ada', 'ada@example.com')).status).toBe(200)
    expect((await userByEmail('ada@example.com'))?.name).toBe('Ada Lovelace')
  })

  it('names Hide My Email accounts without a name “Reader”', async () => {
    const email = 'x7k2p9@privaterelay.appleid.com'
    expect((await signInWithApple('apple-relay', email)).status).toBe(200)
    expect((await userByEmail(email))?.name).toBe('Reader')
  })

  it('rejects an identity token whose nonce does not match', async () => {
    const res = await signInWithApple('apple-replay', 'replay@example.com', { nonce: 'other' })
    expect(res.status).toBe(401)
    expect(await userByEmail('replay@example.com')).toBeUndefined()
  })

  it('does not take over a password account with the same email', async () => {
    await createUserAccount(auth, { username: 'grace', password: 'grace-password', role: 'user' })
    await pool.query(`update auth_user set email = 'grace@example.com' where username = 'grace'`)
    const res = await signInWithApple('apple-grace', 'grace@example.com')
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('OAUTH_LINK_ERROR')
    const { rows } = await pool.query(`select 1 from auth_account where account_id = 'apple-grace'`)
    expect(rows).toHaveLength(0)
  })
})

describe('deleting an Apple account', () => {
  it('revokes the Apple token, then deletes the account', async () => {
    const res = await signInWithApple('apple-del', 'del@example.com')
    const token = res.headers.get('set-auth-token') ?? ''
    const user = await userByEmail('del@example.com')

    expect((await post('/delete-user', {}, token)).status).toBe(200)
    expect(apple.revoked).toEqual([{ token: 'refresh-apple-del', clientId: bundleId }])
    expect(await userByEmail('del@example.com')).toBeUndefined()
    const { rows } = await pool.query('select 1 from auth_account where user_id = $1', [user?.id])
    expect(rows).toHaveLength(0)
  })

  it('still deletes the account when Apple rejects the revocation, and logs it', async () => {
    const res = await signInWithApple('apple-fail', 'fail@example.com')
    const token = res.headers.get('set-auth-token') ?? ''
    apple.failRevokeFor = [bundleId]
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect((await post('/delete-user', {}, token)).status).toBe(200)
    expect(apple.revoked).toEqual([{ token: 'refresh-apple-fail', clientId: bundleId }])
    expect(await userByEmail('fail@example.com')).toBeUndefined()
    expect(String(logged.mock.calls[0]?.[0])).toMatch(/revocation failed/)
  })
})

const decodeJwt = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as Record<
    string,
    unknown
  >
const cookiesOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')

describe('Sign in with Apple on the web', () => {
  let webAuth: Auth
  beforeAll(() => {
    webAuth = createAuth(createDb(pool), webEnv)
  })

  /** Login page → Apple → Apple's form POST → better-auth's GET redirect → signed in. */
  async function webSignIn(sub: string, user?: object) {
    const start = await post(
      '/sign-in/social',
      { provider: 'apple', callbackURL: '/' },
      undefined,
      webAuth,
    )
    expect(start.status).toBe(200)
    const authorize = new URL(((await start.json()) as { url: string }).url)
    const cookie = cookiesOf(start)

    const form = new URLSearchParams({
      state: authorize.searchParams.get('state') ?? '',
      code: `code-for-${sub}`,
    })
    if (user) form.set('user', JSON.stringify(user))
    // Apple posts cross-site with no cookies; better-auth answers with a same-site GET redirect.
    const posted = await webAuth.handler(
      new Request('http://localhost:3000/api/auth/callback/apple', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'https://appleid.apple.com',
        },
        body: form,
      }),
    )
    expect(posted.status).toBe(302)
    const callback = await webAuth.handler(
      new Request(posted.headers.get('location') ?? '', { headers: { cookie } }),
    )
    return { authorize, callback }
  }

  it('shows the button only with a Services ID', () => {
    expect(readConfig(webEnv).appleSignIn).toBe(true)
    expect(readConfig(env).appleSignIn).toBe(false)
  })

  it('signs up through the Services ID and keeps the refresh token', async () => {
    const { authorize, callback } = await webSignIn('apple-web', {
      name: { firstName: 'Web', lastName: 'Reader' },
    })
    expect(authorize.searchParams.get('client_id')).toBe(servicesId)
    expect(authorize.searchParams.get('response_mode')).toBe('form_post')
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe('/')

    const user = await userByEmail('apple-web@example.com')
    expect(user?.name).toBe('Web Reader')
    const { rows } = await pool.query(
      `select refresh_token from auth_account where user_id = $1 and provider_id = 'apple'`,
      [user?.id],
    )
    expect(rows).toEqual([{ refresh_token: 'refresh-apple-web' }])

    // The code exchange used the Services ID and a secret signed just now.
    const request = apple.tokenRequests.at(-1)
    expect(request?.get('client_id')).toBe(servicesId)
    const secret = decodeJwt(request?.get('client_secret') ?? '')
    expect(secret.sub).toBe(servicesId)
    expect(Math.abs(Number(secret.iat) - Date.now() / 1000)).toBeLessThan(5)
  })

  it('signs a fresh client secret for each sign-in', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      await webSignIn('apple-early')
      vi.setSystemTime(new Date('2027-01-01T00:00:00Z'))
      await webSignIn('apple-late')
    } finally {
      vi.useRealTimers()
    }
    const [early, late] = apple.tokenRequests.map((r) => decodeJwt(r.get('client_secret') ?? ''))
    expect(Number(late?.iat) - Number(early?.iat)).toBe(365 * 24 * 60 * 60)
  })

  it('still accepts the app’s identity tokens', async () => {
    const res = await signInWithApple('apple-native', 'native@example.com')
    expect(res.status).toBe(200)
  })

  it('revokes with both clients and deletes when either accepts', async () => {
    const { callback } = await webSignIn('apple-both')
    const cookie = cookiesOf(callback)
    apple.failRevokeFor = [bundleId]
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await webAuth.handler(
      new Request('http://localhost:3000/api/auth/delete-user', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie, origin: 'http://localhost:3000' },
        body: '{}',
      }),
    )
    expect(res.status).toBe(200)
    expect(apple.revoked).toEqual([
      { token: 'refresh-apple-both', clientId: bundleId },
      { token: 'refresh-apple-both', clientId: servicesId },
    ])
    expect(await userByEmail('apple-both@example.com')).toBeUndefined()
    expect(logged).not.toHaveBeenCalled()
  })
})
