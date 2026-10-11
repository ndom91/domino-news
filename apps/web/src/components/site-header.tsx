import { clockTime, longDate, plural } from '@dn/domain'
import { Menu, MenuItem, MenuLinkItem, UserAvatar } from '@dn/ui'
import { CaretDownIcon, MoonIcon, SunIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link, useMatchRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { queries } from '../lib/api.ts'
import { authClient } from '../lib/auth-client.ts'
import { currentTheme, switchTheme, type Theme } from '../lib/theme.ts'

const NAV = [
  { to: '/', label: 'Front page', exact: true },
  { to: '/blindspot', label: 'Blindspot', exact: false },
  { to: '/narratives', label: 'Narratives', exact: false },
  { to: '/publishers', label: 'Publishers', exact: false },
  { to: '/search', label: 'Search', exact: false },
  { to: '/ops', label: 'Pipeline', exact: false, adminOnly: true },
] as const

const navFor = (user: { isAdmin: boolean }) =>
  NAV.filter((item) => user.isAdmin || !('adminOnly' in item))

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
            {plural(front.stats.stories, 'story', 'stories')} from{' '}
            {plural(front.stats.publishers, 'publisher')} in the last 24 hours
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
        <header className="flex items-end justify-between gap-x-6 border-b-6 border-rule pt-5.5 pb-3.5 max-lg:gap-x-2 max-md:border-b-4">
          <Link to="/" className="type-masthead" aria-label="Domino, front page">
            Domino<span className="text-accent">.</span>
          </Link>
          <nav
            aria-label="Primary"
            className="ml-auto flex gap-2 text-base font-semibold max-lg:hidden"
          >
            {navFor(user).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.exact }}
                className="inline-flex min-h-tap flex-none items-center px-2.5 whitespace-nowrap hover:not-aria-[current=page]:text-accent-text"
                activeProps={{
                  className: 'bg-accent text-accent-contrast',
                  'aria-current': 'page',
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <SectionMenu items={navFor(user)} />
          <UserMenu user={user} />
        </header>
      </div>
    </>
  )
}

/** Narrow screens: the current section's name opens a menu of all sections. */
function SectionMenu({ items }: { items: ReturnType<typeof navFor> }) {
  const matchRoute = useMatchRoute()
  const current = items.find((item) => matchRoute({ to: item.to, fuzzy: !item.exact }))
  return (
    <div className="ml-auto lg:hidden">
      <Menu
        trigger={
          <button
            type="button"
            aria-label={current ? `Sections, current: ${current.label}` : 'Sections'}
            className="inline-flex min-h-tap items-center gap-1.5 px-2.5 text-base font-semibold"
          >
            {current?.label ?? 'Sections'}
            <CaretDownIcon aria-hidden size={14} weight="bold" />
          </button>
        }
      >
        {items.map((item) => (
          <MenuLinkItem
            key={item.to}
            render={
              <Link
                to={item.to}
                activeOptions={{ exact: item.exact }}
                activeProps={{ 'aria-current': 'page' }}
              />
            }
          >
            {item.label}
          </MenuLinkItem>
        ))}
      </Menu>
    </div>
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
          className="inline-flex size-tap flex-none items-center justify-end"
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
        tone="danger"
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

/**
 * The icon shows the current theme; the new one grows out of it, with the menu kept open.
 * Menu content only mounts on the client, so currentTheme() can read the DOM.
 */
function ThemeItem() {
  const [theme, setCurrent] = useState(currentTheme)
  const icon = useRef<HTMLSpanElement>(null)
  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  return (
    <MenuItem
      closeOnClick={false}
      aria-label={`Switch to ${next} theme`}
      onClick={() => {
        // Flip the icon first so the transition's new snapshot shows it.
        flushSync(() => setCurrent(next))
        switchTheme(next, icon.current)
      }}
    >
      <span className="flex-1">Theme</span>
      <span ref={icon} aria-hidden className="flex size-8 items-center justify-center">
        {theme === 'dark' ? (
          <MoonIcon size={18} weight="bold" />
        ) : (
          <SunIcon size={18} weight="bold" />
        )}
      </span>
    </MenuItem>
  )
}

/** Always-dark footer: what Domino is, how summaries are made, and the main pages again. */
export function SiteFooter({ user }: { user: { isAdmin: boolean } }) {
  return (
    <footer className="mt-24 bg-band text-band-text">
      <div className="mx-auto max-w-page px-gutter pb-[calc(3rem+var(--dn-safe-bottom))]">
        <div className="grid gap-x-14 gap-y-8 pt-12 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
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
              {navFor(user).map((item) => (
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
