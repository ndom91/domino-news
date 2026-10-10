import { clockTime, longDate } from '@dn/domain'
import { cx, Menu, MenuCheckboxItem, MenuItem, MenuLinkItem, UserAvatar } from '@dn/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { queries } from '../lib/api.ts'
import { authClient } from '../lib/auth-client.ts'
import { currentTheme, setTheme } from '../lib/theme.ts'

const NAV = [
  { to: '/', label: 'Front page', exact: true },
  { to: '/narratives', label: 'Narratives', exact: false },
  { to: '/publishers', label: 'Publishers', exact: false },
  { to: '/search', label: 'Search', exact: false },
  { to: '/ops', label: 'Pipeline', exact: false, adminOnly: true },
] as const

/** Always-dark strip: edition date and time, and how much was reported in the last 24 hours. */
function Strip() {
  // Shared with the front page loader; other pages fill it in after load.
  const front = useQuery(queries.front()).data
  const editionAt = front?.editionAt
  return (
    <div className="bg-band text-sm text-band-text">
      <div className="mx-auto flex h-strip max-w-page items-center justify-between gap-4 px-gutter">
        <span suppressHydrationWarning>
          <b className="font-bold">{longDate(editionAt ?? new Date().toISOString())}</b>
          {editionAt ? ` · Edition ${clockTime(editionAt)} UTC` : null}
        </span>
        {front ? (
          <span className="max-md:hidden">
            {front.stats.stories} {front.stats.stories === 1 ? 'story' : 'stories'} from{' '}
            {front.stats.publishers} {front.stats.publishers === 1 ? 'publisher' : 'publishers'} in
            the last 24 hours
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function SiteHeader({
  user,
}: {
  user: { name: string; email: string; username: string | null; isAdmin: boolean }
}) {
  return (
    <>
      <Strip />
      <div className="mx-auto max-w-page px-gutter pt-(--dn-safe-top)">
        <header className="flex items-end justify-between gap-x-6 border-b-6 border-rule pt-5.5 pb-3.5 max-md:flex-wrap max-md:gap-y-2 max-md:border-b-4">
          <Link to="/" className="type-masthead" aria-label="Domino, front page">
            Domino<span className="text-accent">.</span>
          </Link>
          <nav
            aria-label="Primary"
            className="ml-auto flex gap-7 text-base font-semibold [scrollbar-width:none] max-md:order-last max-md:ml-0 max-md:w-full max-md:gap-6 max-md:overflow-x-auto"
          >
            {NAV.filter((item) => user.isAdmin || !('adminOnly' in item)).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="inline-flex min-h-tap flex-none items-end pb-0.5 whitespace-nowrap hover:text-accent-text"
                activeProps={{
                  className: cx('shadow-[inset_0_-3px_0_var(--dn-accent)]'),
                  'aria-current': 'page',
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          {/* After the nav on wide screens; beside the masthead on narrow ones (nav wraps below). */}
          <UserMenu user={user} />
        </header>
      </div>
    </>
  )
}

/** Avatar button that opens Settings and Sign out. */
function UserMenu({ user }: { user: { name: string; email: string; username: string | null } }) {
  const router = useRouter()
  const navigate = useNavigate()
  return (
    <Menu
      trigger={
        <button
          type="button"
          aria-label={`Account menu for ${user.username ?? user.name}`}
          className="inline-flex size-tap flex-none items-end justify-end"
        >
          <UserAvatar name={user.email || user.name} />
        </button>
      }
    >
      <p className="border-b border-border px-4 pt-1.5 pb-2.5 type-meta">
        Signed in as <b className="font-semibold text-text">{user.username ?? user.name}</b>
      </p>
      <MenuLinkItem render={<Link to="/account" />}>Settings</MenuLinkItem>
      <ThemeItem />
      <MenuItem
        onClick={async () => {
          await authClient.signOut()
          await router.invalidate()
          await navigate({ to: '/login' })
        }}
      >
        Sign out
      </MenuItem>
    </Menu>
  )
}

/** Menu content only mounts when open, on the client, so reading the DOM here is safe. */
function ThemeItem() {
  const [dark, setDark] = useState(() => currentTheme() === 'dark')
  return (
    <MenuCheckboxItem
      checked={dark}
      onCheckedChange={(checked) => {
        setTheme(checked ? 'dark' : 'light')
        setDark(checked)
      }}
    >
      Dark theme
    </MenuCheckboxItem>
  )
}

/** Always-dark footer: what Domino is, how summaries are made, and the main pages again. */
export function SiteFooter({ user }: { user: { isAdmin: boolean } }) {
  return (
    <footer className="mt-24 bg-band text-band-text">
      <div className="mx-auto max-w-page px-gutter pb-[calc(3rem+var(--dn-safe-bottom))]">
        <div className="grid gap-x-14 gap-y-8 border-t border-band-line pt-12 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div>
            <Link to="/" className="type-section" aria-label="Domino, front page">
              Domino<span className="text-accent">.</span>
            </Link>
            <p className="mt-4 max-w-reading text-base leading-normal text-band-muted">
              Stories assembled from the feeds of many publishers, with every source linked.
              Summaries are written by a language model and say what publishers report, not what
              Domino has verified.
            </p>
          </div>
          <nav aria-label="Footer" className="border-t-2 border-band-text pt-3">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-base font-semibold">
              {NAV.filter((item) => user.isAdmin || !('adminOnly' in item)).map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="hover:underline underline-offset-3">
                    {item.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/account" className="hover:underline underline-offset-3">
                  Account
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  )
}
