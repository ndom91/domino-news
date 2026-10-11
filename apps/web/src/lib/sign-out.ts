import { useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from './auth-client.ts'

/** Sign out, drop the cached session from the router, then go to /login. */
export function useSignOut() {
  const router = useRouter()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  async function signOut() {
    setPending(true)
    await authClient.signOut()
    await router.invalidate()
    await navigate({ to: '/login' })
  }
  return { signOut, pending }
}
