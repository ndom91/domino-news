import { Button, Notice, TextInput } from '@dn/ui'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { type FormEvent, useEffect, useState } from 'react'
import { z } from 'zod'
import { authClient } from '../lib/auth-client.ts'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ next: z.string().optional() }),
  beforeLoad: ({ context }) => {
    if (context.session.user) throw redirect({ to: '/' })
  },
  head: () => ({ meta: [{ title: 'Sign in · Domino News' }] }),
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const { next } = Route.useSearch()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function finishSignIn() {
    await router.invalidate()
    // Only follow same-origin relative paths.
    const target = next?.startsWith('/') && !next.startsWith('//') ? next : '/'
    await router.navigate({ href: target })
  }

  // Offer saved passkeys in the username field's autofill (conditional UI), where supported.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on mount
  useEffect(() => {
    if (typeof PublicKeyCredential === 'undefined') return
    void PublicKeyCredential.isConditionalMediationAvailable?.().then(async (available) => {
      if (!available) return
      const { error } = await authClient.signIn.passkey({ autoFill: true })
      if (!error) await finishSignIn()
    })
  }, [])

  async function signInWithPasskey() {
    setPending(true)
    setError(null)
    const { error } = await authClient.signIn.passkey()
    setPending(false)
    if (error) {
      setError('Passkey sign-in was cancelled or not recognised. Try again or use your password.')
      return
    }
    await finishSignIn()
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    const { error } = await authClient.signIn.username({
      username: String(form.get('username') ?? ''),
      password: String(form.get('password') ?? ''),
    })
    setPending(false)
    if (error) {
      setError(
        error.status === 401
          ? 'Username or password is incorrect.'
          : (error.message ?? 'Sign-in failed.'),
      )
      return
    }
    await finishSignIn()
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-(--dn-gutter) py-16">
      <p className="font-serif text-3xl font-semibold tracking-tight">
        Domino<span className="text-accent">.</span>
      </p>
      <p className="mt-2 mb-8 text-sm text-text-secondary">
        News stories assembled from many outlets, with every source linked.
      </p>
      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <TextInput
          label="Username"
          name="username"
          autoComplete="username webauthn"
          required
          autoFocus
        />
        <TextInput
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {error ? <Notice tone="error" title={error} /> : null}
        <Button type="submit" variant="primary" loading={pending}>
          Sign in
        </Button>
      </form>
      <div className="mt-4 flex items-center gap-3 text-xs text-text-muted">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button className="mt-4 w-full" onClick={signInWithPasskey} disabled={pending}>
        Sign in with a passkey
      </Button>
      <p className="mt-8 text-xs text-text-muted">
        Accounts are created by an administrator with{' '}
        <code className="font-mono">pnpm cli user:create</code>.
      </p>
    </div>
  )
}
