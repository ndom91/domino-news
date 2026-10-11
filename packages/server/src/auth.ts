import { passkey } from '@better-auth/passkey'
import { type Db, schema } from '@dn/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
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
 */
export function createAuth(db: Db, env = process.env) {
  const baseURL = env.BETTER_AUTH_URL ?? 'http://localhost:4000'
  const googleClientId = env.GOOGLE_CLIENT_ID
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET
  // Behind proxies X-Forwarded-For holds several hops, which better-auth won't trust, so rate
  // limits would fall back to one bucket shared by everyone. E.g. cf-connecting-ip behind Cloudflare.
  const ipAddressHeaders = env.AUTH_IP_HEADERS?.split(',')
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean)
  return betterAuth({
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
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
    // input: false keeps clients from setting their own role at sign-up or via update-user.
    user: { additionalFields: { role: { type: 'string', defaultValue: 'user', input: false } } },
    session: { expiresIn: 60 * 60 * 24 * 30 },
    advanced: ipAddressHeaders?.length ? { ipAddress: { ipAddressHeaders } } : undefined,
    plugins: [
      username(),
      bearer(),
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
