import { Button, cx } from '@dn/ui'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '../lib/auth-client.ts'

const NAV = [
  { to: '/', label: 'Front page', exact: true },
  { to: '/narratives', label: 'Narratives', exact: false },
  { to: '/publishers', label: 'Publishers', exact: false },
  { to: '/search', label: 'Search', exact: false },
  { to: '/ops', label: 'Pipeline', exact: false },
] as const

export function SiteHeader({ user }: { user: { name: string; username: string | null } }) {
  const router = useRouter()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  const today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  return (
    <header className="border-b border-rule bg-canvas pt-(--dn-safe-top)">
      <div className="mx-auto flex max-w-content flex-wrap items-end justify-between gap-x-6 gap-y-3 px-(--dn-gutter) pt-5 pb-3">
        <div className="flex items-baseline gap-4">
          <Link to="/" className="font-serif text-2xl font-semibold tracking-tight text-text">
            Domino<span className="text-accent">.</span>
          </Link>
          <span className="hidden font-mono text-xs text-text-muted sm:inline">{today}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link to="/account" className="text-text-muted hover:text-text">
            {user.username ?? user.name}
          </Link>
          <Button
            size="sm"
            variant="ghost"
            loading={signingOut}
            onClick={async () => {
              setSigningOut(true)
              await authClient.signOut()
              await router.invalidate()
              await navigate({ to: '/login' })
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
      <nav aria-label="Main" className="mx-auto max-w-content overflow-x-auto px-(--dn-gutter)">
        <ul className="flex gap-6 text-sm">
          {NAV.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="inline-flex min-h-tap items-center border-b-2 border-transparent pb-1 whitespace-nowrap text-text-secondary hover:text-text"
                activeProps={{ className: cx('border-text! text-text!') }}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  )
}
