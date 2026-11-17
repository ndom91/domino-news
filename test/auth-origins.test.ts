import { createDb, createPool } from '@dn/db'
import { type Auth, createAuth, createUserAccount } from '@dn/server/auth'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { truncateAll } from './harness.ts'

const primary = 'https://dominowire.com'
const legacy = 'https://domino-wire.ndo.dev'
const credentials = { username: 'domain_migration', password: 'domain-migration-password' }
const env = {
  ...process.env,
  BETTER_AUTH_URL: primary,
  BETTER_AUTH_ADDITIONAL_ORIGINS: ` ${legacy}/, `,
  GOOGLE_CLIENT_ID: 'migration-test.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'migration-test-secret',
}
let pool: ReturnType<typeof createPool>
let db: ReturnType<typeof createDb>
let auth: Auth

function post(instance: Auth, origin: string, path: string, body: unknown, headers = {}) {
  return instance.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  )
}

function sessionCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
}

beforeAll(async () => {
  pool = createPool()
  db = createDb(pool)
  auth = createAuth(db, env)
  // Better Auth skips these checks under Vitest by default. Exercise production checks here.
  const context = await auth.$context
  context.skipOriginCheck = false
  context.skipCSRFCheck = false
  await createUserAccount(auth, { ...credentials, role: 'user' })
})

afterAll(async () => {
  if (pool) {
    await truncateAll({ pool })
    await pool.end()
  }
})

describe('domain migration authentication', () => {
  it('accepts sessions issued before the migration on both domains and the direct API', async () => {
    const previousAuth = createAuth(db, {
      ...env,
      BETTER_AUTH_URL: legacy,
      BETTER_AUTH_ADDITIONAL_ORIGINS: '',
    })
    const signIn = await post(previousAuth, legacy, '/sign-in/username', credentials, {
      'expo-origin': 'dominonews://',
    })
    expect(signIn.status).toBe(200)
    const cookie = sessionCookie(signIn)
    const token = signIn.headers.get('set-auth-token')
    expect(token).toBeTruthy()

    for (const origin of [legacy, primary]) {
      for (const headers of [{ cookie }, { authorization: `Bearer ${token}` }]) {
        const response = await auth.handler(
          new Request(`${origin}/api/auth/get-session`, { headers }),
        )
        expect(response.status).toBe(200)
        expect(await response.json()).toMatchObject({ user: { username: credentials.username } })
      }
    }
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toMatchObject({
      user: { username: credentials.username },
    })
  })

  it.each([legacy, primary])(
    'signs in native and web readers at %s with host-only secure cookies',
    async (origin) => {
      for (const headers of [
        { 'expo-origin': 'dominonews://', cookie: 'existing=value' },
        { origin, cookie: 'existing=value' },
      ]) {
        const response = await post(auth, origin, '/sign-in/username', credentials, headers)
        expect(response.status).toBe(200)
        const cookies = response.headers.getSetCookie()
        expect(
          cookies.some((cookie) => cookie.startsWith('__Secure-better-auth.session_token=')),
        ).toBe(true)
        for (const cookie of cookies) {
          expect(cookie).toMatch(/; Secure/i)
          expect(cookie).not.toMatch(/; Domain=/i)
        }
      }
    },
  )

  it.each([legacy, primary])(
    'keeps the Google callback on %s behind a TLS-terminating proxy',
    async (origin) => {
      const response = await post(
        auth,
        'http://web.internal:4000',
        '/sign-in/social',
        { provider: 'google', callbackURL: `${origin}/`, disableRedirect: true },
        { host: new URL(origin).host, origin, 'x-forwarded-host': 'attacker.example' },
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(new URL(body.url).searchParams.get('redirect_uri')).toBe(
        `${origin}/api/auth/callback/google`,
      )
    },
  )

  it.each([legacy, primary])('uses the matching passkey relying-party ID at %s', async (origin) => {
    const response = await auth.handler(
      new Request(`${origin}/api/auth/passkey/generate-authenticate-options`, {
        headers: { origin },
      }),
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ rpId: new URL(origin).hostname })
  })

  it('rejects untrusted browser origins, app schemes and callback URLs', async () => {
    const invalidOrigin = await post(auth, primary, '/sign-in/username', credentials, {
      origin: 'https://attacker.example',
      cookie: 'existing=value',
    })
    expect(invalidOrigin.status).toBe(403)
    const invalidScheme = await post(auth, legacy, '/sign-in/username', credentials, {
      'expo-origin': 'evilapp://',
      cookie: 'existing=value',
    })
    expect(invalidScheme.status).toBe(403)
    const invalidCallback = await post(
      auth,
      primary,
      '/sign-in/social',
      {
        provider: 'google',
        callbackURL: 'https://dominowire.com.attacker.example/',
      },
      { origin: primary },
    )
    expect(invalidCallback.status).toBe(403)
  })

  it('returns to one trusted web origin when aliases are removed', async () => {
    const singleOrigin = createAuth(db, { ...env, BETTER_AUTH_ADDITIONAL_ORIGINS: '' })
    const context = await singleOrigin.$context
    expect(context.isTrustedOrigin(primary)).toBe(true)
    expect(context.isTrustedOrigin(legacy)).toBe(false)
    expect(context.isTrustedOrigin('dominonews://')).toBe(true)
  })

  it.each([
    'https://*.ndo.dev',
    'https://domino-wire.ndo.dev/api/auth',
    'http://domino-wire.ndo.dev',
    'https://user:password@domino-wire.ndo.dev',
  ])('rejects an alias that is not an exact origin with the canonical protocol: %s', (origin) => {
    expect(() => createAuth(db, { ...env, BETTER_AUTH_ADDITIONAL_ORIGINS: origin })).toThrow(
      /BETTER_AUTH_ADDITIONAL_ORIGINS/,
    )
  })
})
