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
let apple: { tokenRequests: URLSearchParams[]; revoked: string[]; revokeStatus: number }
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
  apple = { tokenRequests: [], revoked: [], revokeStatus: 200 }
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
      return Response.json({ refresh_token: `refresh-${sub}`, id_token: jwt({ sub }) })
    }
    if (url === 'https://appleid.apple.com/auth/revoke') {
      apple.revoked.push(new URLSearchParams(String(init?.body)).get('token') ?? '')
      return new Response(null, { status: apple.revokeStatus })
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
    const [header, payload, signature] = appleClientSecret(config, 1_700_000_000_000).split('.')
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
    expect(apple.revoked).toEqual(['refresh-apple-del'])
    expect(await userByEmail('del@example.com')).toBeUndefined()
    const { rows } = await pool.query('select 1 from auth_account where user_id = $1', [user?.id])
    expect(rows).toHaveLength(0)
  })

  it('still deletes the account when Apple rejects the revocation, and logs it', async () => {
    const res = await signInWithApple('apple-fail', 'fail@example.com')
    const token = res.headers.get('set-auth-token') ?? ''
    apple.revokeStatus = 500
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect((await post('/delete-user', {}, token)).status).toBe(200)
    expect(apple.revoked).toEqual(['refresh-apple-fail'])
    expect(await userByEmail('fail@example.com')).toBeUndefined()
    expect(String(logged.mock.calls[0]?.[0])).toMatch(/revocation failed/)
  })
})
