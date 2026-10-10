import { Button, Notice, TextInput } from '@dn/ui'
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
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
    await router.invalidate()
    // Only follow same-origin relative paths.
    const target = next?.startsWith('/') && !next.startsWith('//') ? next : '/'
    await router.navigate({ href: target })
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
        <TextInput label="Username" name="username" autoComplete="username" required autoFocus />
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
      <p className="mt-8 text-xs text-text-muted">
        Accounts are created by an administrator with{' '}
        <code className="font-mono">pnpm cli user:create</code>.
      </p>
    </div>
  )
}
