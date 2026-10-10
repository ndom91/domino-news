import { Button, Notice, TextInput } from '@dn/ui'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { authClient } from '../lib/auth-client.ts'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ next: z.string().optional(), error: z.string().optional() }),
  beforeLoad: ({ context }) => {
    if (context.session.user) throw redirect({ to: '/' })
  },
  head: () => ({ meta: [{ title: 'Sign in · Domino News' }] }),
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const { next, error: oauthError } = Route.useSearch()
  const { session } = Route.useRouteContext()
  const [error, setError] = useState<string | null>(
    oauthError ? "This Google account isn't allowed to sign in." : null,
  )
  // Which sign-in method is in flight, so only its button spins.
  const [pending, setPending] = useState<null | 'password' | 'passkey' | 'google'>(null)
  // Wrong credentials shake the fields. Remove, reflow, re-add so repeat failures replay it.
  const fieldsRef = useRef<HTMLDivElement>(null)
  function shakeFields() {
    const el = fieldsRef.current
    if (!el) return
    el.classList.remove('t-shake')
    void el.offsetWidth
    el.classList.add('t-shake')
  }
  // Only follow same-origin relative paths.
  const target = next?.startsWith('/') && !next.startsWith('//') ? next : '/'

  async function finishSignIn() {
    await router.invalidate()
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
    setPending('passkey')
    setError(null)
    const { error } = await authClient.signIn.passkey()
    if (error) {
      setPending(null)
      setError('Passkey sign-in was cancelled or not recognised. Try again or use your password.')
      return
    }
    await finishSignIn()
  }

  async function signInWithGoogle() {
    setPending('google')
    setError(null)
    // Success leaves the page for Google; failures come back to /login?error=...
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: target,
      errorCallbackURL: '/login',
    })
    if (error) {
      setPending(null)
      setError(error.message ?? 'Google sign-in failed.')
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending('password')
    setError(null)
    const { error } = await authClient.signIn.username({
      username: String(form.get('username') ?? ''),
      password: String(form.get('password') ?? ''),
    })
    if (error) {
      setPending(null)
      setError(
        error.status === 401
          ? 'Username or password is incorrect.'
          : (error.message ?? 'Sign-in failed.'),
      )
      if (error.status === 401) shakeFields()
      return
    }
    await finishSignIn()
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-gutter py-16">
      <h1 translate="no" className="border-b-6 border-rule pb-3.5 type-masthead">
        Domino<span className="text-accent">.</span>
      </h1>
      <p className="mt-4 mb-8 text-text-secondary">
        News stories assembled from many publishers, with every source linked.
      </p>
      <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <div ref={fieldsRef} className="flex flex-col gap-4">
          <TextInput
            label="Username"
            name="username"
            autoComplete="username webauthn"
            autoCapitalize="none"
            spellCheck={false}
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
        </div>
        {error ? <Notice tone="error" title={error} /> : null}
        <Button
          type="submit"
          variant="primary"
          loading={pending === 'password'}
          disabled={pending !== null}
        >
          Sign in
        </Button>
      </form>
      <div className="mt-4 flex items-center gap-3 text-xs text-text-muted">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button
        className="mt-4 w-full"
        onClick={signInWithPasskey}
        loading={pending === 'passkey'}
        disabled={pending !== null}
      >
        Sign in with a passkey
      </Button>
      {session.features.googleSignIn ? (
        <Button
          className="mt-3 w-full"
          onClick={signInWithGoogle}
          loading={pending === 'google'}
          disabled={pending !== null}
        >
          Continue with Google
        </Button>
      ) : null}
      <p className="mt-8 text-xs text-text-muted">
        Ask an administrator for an account
        {session.features.googleSignIn ? ', or continue with Google if your email is allowed' : ''}.
      </p>
    </div>
  )
}
