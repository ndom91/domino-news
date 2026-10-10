import { type Db, schema } from '@dn/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer, username } from 'better-auth/plugins'

/**
 * Whole app sits behind login. Username + password today; bearer tokens let API clients
 * (and later the Expo app) authenticate without cookies. Passkeys are the planned next
 * plugin (@better-auth/passkey) and need only a new table plus client wiring.
 * Public sign-up is disabled: create accounts with `pnpm cli user:create`.
 */
export function createAuth(db: Db, env = process.env) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.authUser,
        session: schema.authSession,
        account: schema.authAccount,
        verification: schema.authVerification,
      },
    }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
    session: { expiresIn: 60 * 60 * 24 * 30 },
    plugins: [username(), bearer()],
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
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await ctx.password.hash(input.password),
  })
  return user
}
