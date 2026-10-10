import { passkey } from '@better-auth/passkey'
import { type Db, schema } from '@dn/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { bearer, username } from 'better-auth/plugins'

/**
 * Whole app sits behind login: username + password or passkeys (added after a password
 * sign-in, from the account page). Bearer tokens let API clients (and later the Expo app)
 * authenticate without cookies.
 * Public sign-up is disabled: create accounts with `pnpm cli user:create`.
 * Google sign-in is optional (GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET). It may only create
 * accounts for emails in GOOGLE_ALLOWED_EMAILS, because disableSignUp doesn't cover OAuth.
 */
export function createAuth(db: Db, env = process.env) {
  const baseURL = env.BETTER_AUTH_URL ?? 'http://localhost:4000'
  const googleClientId = env.GOOGLE_CLIENT_ID
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET
  const googleAllowedEmails = new Set(
    (env.GOOGLE_ALLOWED_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
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
    databaseHooks: {
      user: {
        create: {
          // Only OAuth callbacks are gated; the CLI creates users without a request context.
          before: async (user, ctx) => {
            if (!ctx?.path.startsWith('/callback/')) return
            if (!googleAllowedEmails.has(user.email.toLowerCase())) {
              throw new APIError('FORBIDDEN', { message: 'Email is not allowed to sign in' })
            }
          },
        },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 30 },
    plugins: [
      username(),
      bearer(),
      // WebAuthn is bound to the public origin: rpID must be its hostname.
      passkey({ rpID: new URL(baseURL).hostname, rpName: 'Domino News', origin: baseURL }),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>

/** Server-side account creation, bypassing the disabled public sign-up endpoint. */
export async function createUserAccount(
  auth: Auth,
  input: { username: string; password: string; name?: string },
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
