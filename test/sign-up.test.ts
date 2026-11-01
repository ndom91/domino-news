import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestContext, truncateAll } from './harness.ts'

// Public sign-up through better-auth's /sign-up/email, with the optional-email hook in
// packages/server/src/auth.ts.
let h: Awaited<ReturnType<typeof createTestContext>>

const authCall = (path: string, body: unknown) =>
  h.ctx.auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify(body),
    }),
  )

const userRow = async (username: string) =>
  (
    await h.ctx.pool.query('select email, name, role from auth_user where username = $1', [
      username,
    ])
  ).rows[0] as { email: string; name: string; role: string } | undefined

beforeAll(async () => {
  h = await createTestContext()
})

afterAll(async () => {
  if (h) await truncateAll(h.ctx)
  await h?.close()
})

describe('public sign-up', () => {
  const password = 'sign-up-password'

  it('creates a plain user without an email, who then signs in by username', async () => {
    const username = `reader_${Date.now()}`
    const res = await authCall('/sign-up/email', { username, password })
    expect(res.status).toBe(200)
    expect(await userRow(username)).toEqual({
      email: `${username}@users.local`,
      name: username,
      role: 'user',
    })

    const signIn = await authCall('/sign-in/username', { username, password })
    expect(signIn.status).toBe(200)
  })

  it('keeps a real email when one is given', async () => {
    const username = `mailer_${Date.now()}`
    const res = await authCall('/sign-up/email', {
      username,
      password,
      email: ' Reader@Example.com ',
    })
    expect(res.status).toBe(200)
    expect((await userRow(username))?.email).toBe('reader@example.com')
  })

  it('rejects placeholder emails, missing usernames and taken usernames', async () => {
    const username = `taken_${Date.now()}`
    const placeholder = await authCall('/sign-up/email', {
      username: `other_${Date.now()}`,
      password,
      email: `${username}@users.local`,
    })
    expect(placeholder.status).toBe(400)

    const missing = await authCall('/sign-up/email', { password, email: 'x@example.com' })
    expect(missing.status).toBe(400)

    expect((await authCall('/sign-up/email', { username, password })).status).toBe(200)
    expect((await authCall('/sign-up/email', { username, password })).status).toBe(400)
  })

  it('never lets a sign-up choose its role', async () => {
    const username = `sneaky_${Date.now()}`
    // better-auth drops `input: false` fields from the body instead of rejecting the request.
    await authCall('/sign-up/email', { username, password, role: 'admin' })
    expect((await userRow(username))?.role).toBe('user')
  })
})
