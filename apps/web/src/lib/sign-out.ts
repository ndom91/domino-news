import { queryKeys } from '@dn/queries'
import { useToast } from '@dn/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

/** Sign out, drop the cached session from the router, then go to /login. */
export function useSignOut() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const router = useRouter()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  async function signOut() {
    setPending(true)
    // Loaded on demand: better-auth and WebAuthn stay out of the entry chunk.
    try {
      const { authClient } = await import('./auth-client.ts')
      const { error } = await authClient.signOut()
      if (error) throw error
    } catch {
      setPending(false)
      toast.add({
        title: 'Couldn’t sign out.',
        description: 'Try again.',
        type: 'error',
        priority: 'high',
      })
      return
    }
    try {
      queryClient.removeQueries({ queryKey: queryKeys.session() })
      // Navigate before anything reloads the current page, avoiding a signed-out guard redirect.
      await navigate({ to: '/login' })
      await router.invalidate()
      queryClient.clear()
    } catch {
      queryClient.clear()
      setPending(false)
      toast.add({
        title: 'You signed out, but the page could not update.',
        description: 'Reload the page to continue.',
        type: 'error',
        priority: 'high',
        timeout: 0,
      })
    }
  }
  return { signOut, pending }
}
