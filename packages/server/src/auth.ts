import { expo } from '@better-auth/expo'
import { passkey } from '@better-auth/passkey'
import { type Db, schema } from '@dn/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { bearer, username } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { eq } from 'drizzle-orm'

/**
 * Whole app sits behind login: username + password or passkeys (added after a password
 * sign-in, from the account page). Bearer tokens let API clients (and later the Expo app)
 * authenticate without cookies.
 * Public sign-up is disabled: create accounts with `pnpm cli user:create`.
 * Google sign-in is optional (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET). disableSignUp doesn't
 * cover OAuth, so any Google account can sign up.
 * Roles: CLI-created accounts are admins by default; Google sign-ups are plain users.
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
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
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
      passkey({ rpID: new URL(baseURL).hostname, rpName: 'Domino News', origin: baseURL }),
      // Writes cookies set by server-side auth.api calls (e.g. getSession's sliding refresh)
      // onto the TanStack Start response. Must stay last.
      tanstackStartCookies(),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>

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
      email: `${normalized}@users.local`,
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
