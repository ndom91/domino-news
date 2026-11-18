import { expo } from '@better-auth/expo'
import { passkey } from '@better-auth/passkey'
import { type Db, schema } from '@dn/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { bearer, username } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { and, eq } from 'drizzle-orm'
import {
  type AppleConfig,
  appleFallbackName,
  exchangeAppleCode,
  readAppleConfig,
  revokeAppleToken,
} from './apple.ts'

/**
 * Whole app sits behind login: username + password or passkeys (added after a password
 * sign-in, from the account page). Bearer tokens let API clients (and later the Expo app)
 * authenticate without cookies.
 * Public sign-up (POST /api/auth/sign-up/email) takes a username and password; email is optional.
 * `pnpm cli user:create` still creates accounts directly. Google sign-in is optional
 * (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET), and any Google account can sign up. Sign in with
 * Apple is optional too (APPLE_TEAM_ID + APPLE_KEY_ID + APPLE_PRIVATE_KEY, iOS app only; see apple.ts).
 * Neither links to an account whose email isn't verified, so password accounts are never taken over.
 * Roles: CLI-created accounts are admins by default; public and Google sign-ups are plain users.
 * Mobile: the Expo app signs in through the expo() plugin. Native requests have no Origin, so
 * the app sends its scheme in `expo-origin`, which must be listed in trustedOrigins.
 */
export function createAuth(db: Db, env = process.env) {
  const baseURL = env.BETTER_AUTH_URL ?? 'http://localhost:4000'
  const publicURL = new URL(baseURL)
  const additionalOrigins = (env.BETTER_AUTH_ADDITIONAL_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      const url = new URL(origin)
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.protocol !== publicURL.protocol ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash ||
        url.hostname.includes('*')
      ) {
        throw new Error(
          'BETTER_AUTH_ADDITIONAL_ORIGINS must list exact origins using the BETTER_AUTH_URL protocol',
        )
      }
      return url.origin
    })
  const googleClientId = env.GOOGLE_CLIENT_ID
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET
  const apple = readAppleConfig(env)
  // Behind proxies X-Forwarded-For holds several hops, which better-auth won't trust, so rate
  // limits would fall back to one bucket shared by everyone. E.g. cf-connecting-ip behind Cloudflare.
  // The Expo app's URL scheme (app.json "scheme"). Expo Go uses exp:// URLs, which are only
  // trusted in development: anyone can open an exp:// URL.
  const appScheme = env.EXPO_APP_SCHEME ?? 'dominonews'
  const trustedOrigins = [
    `${appScheme}://`,
    ...(env.NODE_ENV === 'development' ? ['exp://', 'exp://**', 'exp://192.168.*.*:*/**'] : []),
  ]
  const ipAddressHeaders = env.AUTH_IP_HEADERS?.split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean)
  return betterAuth({
    // Resolve callbacks on the requested, explicitly allowed host during domain migrations.
    // Keep the canonical URL as the fallback for server-side API calls without a request.
    baseURL: additionalOrigins.length
      ? {
          allowedHosts: [baseURL, ...additionalOrigins],
          fallback: baseURL,
          protocol: publicURL.protocol === 'https:' ? 'https' : 'http',
        }
      : baseURL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.authUser,
        session: schema.authSession,
        account: schema.authAccount,
        verification: schema.authVerification,
        passkey: schema.authPasskey,
      },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
    hooks: { before: optionalSignUpEmail, after: storeAppleRefreshToken(db, apple) },
    socialProviders: {
      ...(googleClientId && googleClientSecret
        ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
        : {}),
      // Native ID-token sign-in only: without a clientSecret better-auth refuses the web redirect
      // flow. The token's audience must be the bundle ID.
      ...(apple
        ? {
            apple: {
              clientId: apple.clientId,
              appBundleIdentifier: apple.clientId,
              mapProfileToUser: (profile: { name?: string; email?: string }) =>
                profile.name ? {} : { name: appleFallbackName(profile.email) },
            },
          }
        : {}),
    },
    user: {
      // input: false keeps clients from setting their own role at sign-up or via update-user.
      additionalFields: { role: { type: 'string', defaultValue: 'user', input: false } },
      // Self-serve deletion (POST /api/auth/delete-user). better-auth asks for the password, or
      // a session under a day old for accounts without one. Reading data, follows, feedback
      // and passkeys cascade.
      deleteUser: {
        enabled: true,
        // Published assessments keep their reviewer: they're append-only history.
        beforeDelete: async (user) => {
          const [reviewed] = await db
            .select({ id: schema.publisherAssessment.id })
            .from(schema.publisherAssessment)
            .where(eq(schema.publisherAssessment.reviewedBy, user.id))
            .limit(1)
          if (reviewed)
            throw new APIError('BAD_REQUEST', {
              message:
                'This account has published publisher assessments, so it can’t be deleted here. Ask an operator to remove it.',
            })
          await revokeAppleTokens(db, apple, user.id)
        },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 30 },
    advanced: ipAddressHeaders?.length ? { ipAddress: { ipAddressHeaders } } : undefined,
    plugins: [
      username(),
      bearer(),
      expo(),
      // In multi-host mode the plugin derives rpID from the resolved request URL and verifies
      // the browser's checked Origin. Existing passkeys stay bound to their original hostname.
      passkey({
        rpName: 'Domino Wire',
        ...(additionalOrigins.length ? {} : { rpID: publicURL.hostname, origin: baseURL }),
      }),
      // Writes cookies set by server-side auth.api calls (e.g. getSession's sliding refresh)
      // onto the TanStack Start response. Must stay last.
      tanstackStartCookies(),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>

// better-auth requires a unique email on every user. Sign-ups that leave it blank get the same
// placeholder the CLI uses, so readers sign in by username only. A placeholder can't be claimed
// as a real address, or someone could take it before the matching username signs up.
const PLACEHOLDER_EMAIL_DOMAIN = '@users.local'

const placeholderEmail = (username: string) =>
  `${username.trim().toLowerCase()}${PLACEHOLDER_EMAIL_DOMAIN}`

const optionalSignUpEmail = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== '/sign-up/email') return
  const body = ctx.body as Record<string, unknown> | undefined
  if (!body || typeof body.username !== 'string') {
    throw new APIError('BAD_REQUEST', { message: 'Choose a username.' })
  }
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (email.toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN)) {
    throw new APIError('BAD_REQUEST', { message: 'Use a different email address.' })
  }
  body.email = email || placeholderEmail(body.username)
  if (typeof body.name !== 'string' || !body.name.trim()) body.name = body.username.trim()
})

/**
 * After an Apple sign-in, exchange the app's authorization code for a refresh token and keep it
 * on the Apple account, so deleting the account can revoke it. Failures only log: the reader is
 * signed in either way, and deleting an Apple account signs in with Apple again first.
 */
function storeAppleRefreshToken(db: Db, apple: AppleConfig | null) {
  return createAuthMiddleware(async (ctx) => {
    const body = ctx.body as { provider?: unknown; authorizationCode?: unknown } | undefined
    const userId = ctx.context.newSession?.user.id
    if (ctx.path !== '/sign-in/social' || body?.provider !== 'apple' || !apple || !userId) return
    if (typeof body.authorizationCode !== 'string') return
    try {
      const { refreshToken, sub } = await exchangeAppleCode(apple, body.authorizationCode)
      // Matching on the Apple user ID keeps a code for another Apple ID off this account.
      const updated = await db
        .update(schema.authAccount)
        .set({ refreshToken, updatedAt: new Date() })
        .where(
          and(
            eq(schema.authAccount.userId, userId),
            eq(schema.authAccount.providerId, 'apple'),
            eq(schema.authAccount.accountId, sub),
          ),
        )
        .returning({ id: schema.authAccount.id })
      if (!updated.length) console.error('[apple] authorization code is for a different Apple ID')
    } catch (error) {
      console.error('[apple] storing the refresh token failed', error)
    }
  })
}

/**
 * Guideline 5.1.1(v): revoke Apple's tokens when the account is deleted. A failed revocation is
 * logged loudly but doesn't block deletion: the reader asked for their data to go, and they can
 * still remove the app under Settings > Apple ID > Sign in with Apple.
 */
async function revokeAppleTokens(db: Db, apple: AppleConfig | null, userId: string) {
  const accounts = await db
    .select({ refreshToken: schema.authAccount.refreshToken })
    .from(schema.authAccount)
    .where(and(eq(schema.authAccount.userId, userId), eq(schema.authAccount.providerId, 'apple')))
  for (const { refreshToken } of accounts) {
    if (!apple || !refreshToken) {
      console.error(`[apple] user ${userId}: no Apple token to revoke; deleting without revoking`)
      continue
    }
    await revokeAppleToken(apple, refreshToken).catch((error) =>
      console.error(`[apple] user ${userId}: revocation failed; deleting anyway`, error),
    )
  }
}

export type UserRole = 'admin' | 'user'

/** Server-side account creation, bypassing the disabled public sign-up endpoint. */
export async function createUserAccount(
  auth: Auth,
  input: { username: string; password: string; name?: string; role?: UserRole },
) {
  const ctx = await auth.$context
  const normalized = input.username.trim().toLowerCase()
  const user = await ctx.internalAdapter.createUser(
    {
      name: input.name ?? input.username,
      email: placeholderEmail(normalized),
      emailVerified: false,
      username: normalized,
      displayUsername: input.username,
      role: input.role ?? 'admin',
    },
    { method: 'admin' },
  )
  try {
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: 'credential',
      accountId: user.id,
      password: await ctx.password.hash(input.password),
    })
  } catch (error) {
    // Don't leave a user without a credential behind; it would block re-running the command.
    await ctx.internalAdapter.deleteUser(user.id)
    throw error
  }
  return user
}

export async function setUserRole(db: Db, username: string, role: UserRole) {
  const [user] = await db
    .update(schema.authUser)
    .set({ role, updatedAt: new Date() })
    .where(eq(schema.authUser.username, username.trim().toLowerCase()))
    .returning({ id: schema.authUser.id })
  if (!user) throw new Error(`no user with username ${username}`)
  return user
}
