import { queryKeys } from '@dn/queries'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

/** Sign out, drop the cached session from the router, then go to /login. */
export function useSignOut() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  async function signOut() {
    setPending(true)
    // Loaded on demand: better-auth and WebAuthn stay out of the entry chunk.
    const { authClient } = await import('./auth-client.ts')
    await authClient.signOut()
    queryClient.removeQueries({ queryKey: queryKeys.session() })
    // Navigate before anything reloads the current page: re-running its guard as a signed-out
    // user would redirect to /login?next=<this page>, and the next sign-in would land back here.
    await navigate({ to: '/login' })
    await router.invalidate()
    // After leaving the page, so nothing still mounted refetches as a signed-out user.
    queryClient.clear()
  }
  return { signOut, pending }
}
