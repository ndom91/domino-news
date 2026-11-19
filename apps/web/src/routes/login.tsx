import { longDate } from '@dn/domain'
import { Button, Marble, Notice, TextInput } from '@dn/ui'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { z } from 'zod/mini'
import { authClient } from '../lib/auth-client.ts'
import { seo } from '../lib/seo.ts'
import { LEGAL_LINKS } from '../lib/seo-routes.ts'
import { safeNext } from '../lib/session.ts'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({
    next: z.optional(z.string()),
    error: z.optional(z.string()),
    mode: z.optional(z.literal('sign-up')),
  }),
  beforeLoad: ({ context }) => {
    if (context.session.user) throw redirect({ to: '/' })
  },
  // The landing page for signed-out visitors: indexed, with the site's own title.
  head: ({ match }) =>
    seo({ origin: match.context.session.origin, path: match.pathname, index: true }),
  component: LoginPage,
})

// Fixed seed: the same illustration for everyone, every visit.
const MARBLE_SEED = 'Ledger'

/** Google and Apple sign-in failures come back as /login?error=<better-auth code>. */
function oauthErrorMessage(code: string) {
  if (code === 'account_not_linked')
    return 'An account with this email already exists. Sign in with your username and password.'
  return 'That account couldn’t sign in. Try again, or use your username and password.'
}

// Brand marks for the provider buttons. Apple's follows the text colour, so it inverts on hover
// with the button; Google's "G" keeps its own colours, as Google's branding asks.
function AppleLogo() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[18px] shrink-0 fill-current">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  )
}

function GoogleLogo() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-[18px] shrink-0">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

// Matches minPasswordLength in packages/server/src/auth.ts.
const MIN_PASSWORD_LENGTH = 10

function LoginPage() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { next, error: oauthError, mode } = Route.useSearch()
  const signingUp = mode === 'sign-up'
  const { session } = Route.useRouteContext()
  const [error, setError] = useState<string | null>(
    oauthError ? oauthErrorMessage(oauthError) : null,
  )
  // Which sign-in method is in flight, so only its button spins.
  const [pending, setPending] = useState<
    null | 'password' | 'sign-up' | 'passkey' | 'google' | 'apple'
  >(null)
  // Wrong credentials shake the fields. Remove, reflow, re-add so repeat failures replay it.
  const fieldsRef = useRef<HTMLDivElement>(null)
  function shakeFields() {
    const el = fieldsRef.current
    if (!el) return
    el.classList.remove('t-shake')
    void el.offsetWidth
    el.classList.add('t-shake')
  }
  const target = safeNext(next, '/')

  async function finishSignIn() {
    // An expired session lands here without signing out: drop the last user's data.
    queryClient.clear()
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

  async function signInWith(provider: 'google' | 'apple') {
    setPending(provider)
    setError(null)
    // Success leaves the page for the provider; failures come back to /login?error=...
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: target,
      errorCallbackURL: '/login',
    })
    if (error) {
      setPending(null)
      setError(error.message ?? 'Sign-in failed. Try again.')
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

  async function onSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const username = String(form.get('username') ?? '').trim()
    const password = String(form.get('password') ?? '')
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`)
      shakeFields()
      return
    }
    setPending('sign-up')
    setError(null)
    // The server stores a placeholder when email is blank and uses the username as the name.
    const { error } = await authClient.signUp.email({
      username,
      password,
      email: String(form.get('email') ?? '').trim(),
      name: username,
    })
    if (error) {
      setPending(null)
      setError(error.message ?? 'Could not create the account. Try again.')
      shakeFields()
      return
    }
    await finishSignIn()
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="flex flex-col gap-2 bg-band px-gutter pt-4 pb-8 text-band-text lg:pt-6 lg:pb-10">
        <p className="mb-2 text-sm" suppressHydrationWarning>
          <b className="font-bold">{longDate(new Date().toISOString())}</b>
        </p>
        <Marble seed={MARBLE_SEED} className="min-h-36 flex-1" />
        <div className="bg-band-text px-6 pt-5 pb-5 text-band">
          <p translate="no" className="type-masthead">
            Domino<span className="text-accent">.</span>
          </p>
          <p className="mt-2 font-semibold">
            Follow the news as it falls: one story, every source, and what came next.
          </p>
        </div>
      </aside>
      <main className="flex items-center justify-center px-gutter py-12">
        <div className="w-full max-w-100">
          <h1 className="mb-8 border-b-6 border-rule pb-3.5 type-section">
            {signingUp ? 'Create an account' : 'Sign in'}
          </h1>
          {signingUp ? (
            <form
              key="sign-up"
              method="post"
              onSubmit={onSignUp}
              className="flex flex-col gap-4"
              noValidate
            >
              <div ref={fieldsRef} className="flex flex-col gap-4">
                <TextInput
                  label="Username"
                  name="username"
                  description="3–30 letters, numbers, dots or underscores. You sign in with it."
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  minLength={3}
                  maxLength={30}
                  required
                  autoFocus
                />
                <TextInput
                  label="Email (optional)"
                  name="email"
                  type="email"
                  description="Only used to contact you about your account."
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                />
                <TextInput
                  label="Password"
                  name="password"
                  type="password"
                  description={`At least ${MIN_PASSWORD_LENGTH} characters. There’s no password reset yet, so keep it safe.`}
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  required
                />
              </div>
              {error ? <Notice tone="error" title={error} /> : null}
              <Button
                type="submit"
                variant="primary"
                loading={pending === 'sign-up'}
                disabled={pending !== null}
              >
                Create account
              </Button>
            </form>
          ) : (
            <form
              key="sign-in"
              method="post"
              onSubmit={onSubmit}
              className="flex flex-col gap-4"
              noValidate
            >
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
          )}
          <div className="mt-4 flex items-center gap-3 text-xs text-text-muted">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          {signingUp ? null : (
            <Button
              className="mt-4 w-full"
              onClick={signInWithPasskey}
              loading={pending === 'passkey'}
              disabled={pending !== null}
            >
              Sign in with a passkey
            </Button>
          )}
          {session.features.appleSignIn ? (
            <Button
              className={signingUp ? 'mt-4 w-full' : 'mt-3 w-full'}
              onClick={() => signInWith('apple')}
              loading={pending === 'apple'}
              disabled={pending !== null}
            >
              <AppleLogo />
              Continue with Apple
            </Button>
          ) : null}
          {session.features.googleSignIn ? (
            <Button
              className={signingUp && !session.features.appleSignIn ? 'mt-4 w-full' : 'mt-3 w-full'}
              onClick={() => signInWith('google')}
              loading={pending === 'google'}
              disabled={pending !== null}
            >
              <GoogleLogo />
              Continue with Google
            </Button>
          ) : null}
          <p className="mt-8 text-sm text-text-muted">
            {signingUp ? 'Already have an account? ' : 'New to Domino Wire? '}
            <Link
              to="/login"
              search={{ next, mode: signingUp ? undefined : 'sign-up' }}
              onClick={() => setError(null)}
              className="inline-flex min-h-tap items-center font-semibold text-text underline underline-offset-4"
            >
              {signingUp ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
          <nav aria-label="Legal" className="mt-8 border-t border-border pt-2 text-sm">
            <ul className="flex flex-wrap gap-x-5">
              {LEGAL_LINKS.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="inline-flex min-h-tap items-center text-text-muted underline-offset-4 hover:text-text hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </main>
    </div>
  )
}
