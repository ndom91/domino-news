import { expo } from '@better-auth/expo'
import { passkey } from '@better-auth/passkey'
import { type Db, schema } from '@dn/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { bearer, username } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { eq } from 'drizzle-orm'

/**
 * Whole app sits behind login: username + password or passkeys (added after a password
 * sign-in, from the account page). Bearer tokens let API clients (and later the Expo app)
 * authenticate without cookies.
 * Public sign-up (POST /api/auth/sign-up/email) takes a username and password; email is optional.
 * `pnpm cli user:create` still creates accounts directly. Google sign-in is optional
 * (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET), and any Google account can sign up.
 * Roles: CLI-created accounts are admins by default; public and Google sign-ups are plain users.
 * Mobile: the Expo app signs in through the expo() plugin. Native requests have no Origin, so
 * the app sends its scheme in `expo-origin`, which must be listed in trustedOrigins.
 */
export function createAuth(db: Db, env = process.env) {
  const baseURL = env.BETTER_AUTH_URL ?? 'http://localhost:4000'
  const googleClientId = env.GOOGLE_CLIENT_ID
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET
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
    baseURL,
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
    hooks: { before: optionalSignUpEmail },
    socialProviders:
      googleClientId && googleClientSecret
        ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
        : {},
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
        },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 30 },
    advanced: ipAddressHeaders?.length ? { ipAddress: { ipAddressHeaders } } : undefined,
    plugins: [
      username(),
      bearer(),
      expo(),
      // WebAuthn is bound to the public origin: rpID must be its hostname.
      passkey({ rpID: new URL(baseURL).hostname, rpName: 'Domino Wire', origin: baseURL }),
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
