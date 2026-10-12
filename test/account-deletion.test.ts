import { createUserAccount } from '@dn/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestContext, truncateAll } from './harness.ts'

// Self-serve deletion through better-auth's /delete-user (enabled in packages/server/src/auth.ts).
let h: Awaited<ReturnType<typeof createTestContext>>

const authCall = (path: string, body: unknown, token?: string) =>
  h.ctx.auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  )

async function newUser(username: string) {
  const password = 'deletion-password'
  await createUserAccount(h.ctx.auth, { username, password, role: 'user' })
  const res = await authCall('/sign-in/username', { username, password })
  const token = res.headers.get('set-auth-token') ?? ''
  const { rows } = await h.ctx.pool.query('select id from auth_user where username = $1', [
    username,
  ])
  return { id: rows[0].id as string, token, password }
}

const userExists = async (id: string) =>
  (await h.ctx.pool.query('select 1 from auth_user where id = $1', [id])).rowCount === 1

beforeAll(async () => {
  h = await createTestContext()
})

afterAll(async () => {
  if (h) await truncateAll(h.ctx)
  await h?.close()
})

describe('account deletion', () => {
  it('needs the right password, then removes the account and its data', async () => {
    const u = await newUser(`del_${Date.now()}`)
    await h.ctx.pool.query(
      `insert into user_preference (user_id) values ($1) on conflict do nothing`,
      [u.id],
    )

    const wrong = await authCall('/delete-user', { password: 'not-the-password' }, u.token)
    expect(wrong.status).toBe(400)
    expect(await userExists(u.id)).toBe(true)

    const ok = await authCall('/delete-user', { password: u.password }, u.token)
    expect(ok.status).toBe(200)
    expect(await userExists(u.id)).toBe(false)
    const prefs = await h.ctx.pool.query('select 1 from user_preference where user_id = $1', [u.id])
    expect(prefs.rowCount).toBe(0)
  })

  it('keeps accounts that reviewed a publisher assessment', async () => {
    const u = await newUser(`reviewer_${Date.now()}`)
    const publisherId = `pub_test_${Date.now()}`
    await h.ctx.pool.query(
      `insert into publisher (id, slug, name, domain) values ($1, $1, 'Test', $1 || '.example')`,
      [publisherId],
    )
    const assessmentId = `pa_test_${Date.now()}`
    await h.ctx.pool.query(
      `insert into publisher_assessment
         (id, publisher_id, methodology_version, ownership, reliability, evidence, reviewed_by)
       values ($1, $2, 'test', 'Test owner', 'Test', '[]', $3)`,
      [assessmentId, publisherId, u.id],
    )
    // Assessments are append-only (a trigger rejects DELETE); afterAll truncates instead.
    const res = await authCall('/delete-user', { password: u.password }, u.token)
    expect(res.status).toBe(400)
    expect((await res.json()).message).toMatch(/publisher assessments/)
    expect(await userExists(u.id)).toBe(true)
  })
})
