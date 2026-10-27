import { countryName, KNOWN_COUNTRIES } from '@dn/domain'
import {
  queryKeys,
  savePreferencesMutation,
  setFollowMutation,
  setMutedPublisherMutation,
  updateSignalsMutation,
} from '@dn/queries'
import {
  Button,
  ConfirmDialog,
  Notice,
  Reveal,
  SectionLabel,
  Select,
  Tabs,
  TextInput,
  Timestamp,
} from '@dn/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useBlocker, useRouter } from '@tanstack/react-router'
import { type FormEvent, type ReactNode, useState } from 'react'
import { z } from 'zod/mini'
import { FeedPicks } from '../components/feed-picks.tsx'
import { Page, PageTitle } from '../components/page.tsx'
import { ReadingHistoryToggle } from '../components/reading-history.tsx'
import { api, queries } from '../lib/api.ts'
import { authClient } from '../lib/auth-client.ts'
import { useSignOut } from '../lib/sign-out.ts'

const TABS = ['preferences', 'following', 'security'] as const
const ACCOUNT_LIST_ITEMS_SHOWN = 5

export const Route = createFileRoute('/account')({
  // An unknown tab falls back to Preferences instead of erroring.
  validateSearch: z.object({ tab: z.catch(z.optional(z.enum(TABS)), undefined) }),
  // Passkeys load in the browser only (WebAuthn client); the rest renders on the server.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.prefetchQuery(queries.preferences()),
      context.queryClient.prefetchQuery(queries.follows()),
    ]),
  head: () => ({ meta: [{ title: 'Account · Domino Wire' }] }),
  component: AccountPage,
})

const TAB_LABELS = {
  preferences: 'Preferences',
  following: 'Following',
  security: 'Privacy & security',
} as const

function AccountPage() {
  const { session } = Route.useRouteContext()
  const { tab = 'preferences' } = Route.useSearch()
  const navigate = Route.useNavigate()

  const content = {
    preferences: (
      <>
        <NameSection name={session.user?.name ?? ''} />
        <FeedSection />
        <LocalitySection fallbackCountry={session.country} />
        <CountrySection />
      </>
    ),
    following: (
      <>
        <FollowingSection />
        <MutedPublishersSection />
        <LearnedSignals />
      </>
    ),
    security: (
      <>
        <PasskeysSection />
        <ReadingHistorySection />
        <DangerZone />
      </>
    ),
  }

  return (
    <Page>
      <PageTitle>Account</PageTitle>
      <div className="mb-10 flex flex-wrap items-center justify-between gap-3">
        <p className="text-text-secondary">
          Signed in as{' '}
          <span className="font-semibold text-text">
            {session.user?.username ?? session.user?.name}
          </span>
        </p>
        <SignOutButton />
      </div>

      <Tabs
        aria-label="Account settings"
        value={tab}
        // replace: switching tabs shouldn't fill the back stack.
        onValueChange={(next) => navigate({ search: { tab: next }, replace: true })}
        tabs={TABS.map((value) => ({
          value,
          label: TAB_LABELS[value],
          content: <div className="flex flex-col divide-y divide-border">{content[value]}</div>,
        }))}
      />
    </Page>
  )
}

/**
 * One setting per row: heading and explanation on the left, controls on the right. Stacks
 * below md.
 */
function SettingsRow({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="grid scroll-mt-24 grid-cols-3 gap-x-column gap-y-4 py-10 first:pt-2 max-md:grid-cols-1"
    >
      <div>
        <SectionLabel id={`${id}-heading`}>{title}</SectionLabel>
        {description ? (
          <p className="max-w-reading text-sm text-text-secondary">{description}</p>
        ) : null}
      </div>
      <div className="col-span-2 max-md:col-span-1">{children}</div>
    </section>
  )
}

function NameSection({ name }: { name: string }) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [saved, setSaved] = useState(name)
  const [value, setValue] = useState(name)
  const dirty = value.trim() !== saved
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  })
  const save = useMutation({
    mutationFn: async (next: string) => {
      const { error } = await authClient.updateUser({ name: next })
      if (error) throw new Error(error.message ?? 'Could not save your name')
    },
    onSuccess: async (_result, next) => {
      setSaved(next)
      setValue(next)
      await queryClient.invalidateQueries({ queryKey: queryKeys.session() })
      await router.invalidate()
    },
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = value.trim()
    if (next) save.mutate(next)
  }

  return (
    <SettingsRow
      id="name"
      title="Name"
      description="The name used to greet you in your audio briefing."
    >
      <form onSubmit={submit}>
        <TextInput
          label="Name"
          name="name"
          autoComplete="name"
          value={value}
          maxLength={100}
          required
          disabled={save.isPending}
          onChange={(event) => setValue(event.target.value)}
        />
        {save.isError ? (
          <Notice tone="error" title="Name not saved">
            {save.error.message} Try again.
          </Notice>
        ) : null}
        <div className="mt-4">
          <Button
            type="submit"
            variant="primary"
            loading={save.isPending}
            disabled={save.isPending || !value.trim() || !dirty}
          >
            Save name
          </Button>
        </div>
        <p className="mt-2 text-sm text-text-secondary" aria-live="polite">
          {save.isSuccess && !dirty ? 'Name saved.' : ''}
        </p>
      </form>
      <ConfirmDialog
        open={blocker.status === 'blocked'}
        title="Discard your name changes?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      >
        Your name has not been saved.
      </ConfirmDialog>
    </SettingsRow>
  )
}

const passkeysKey = ['account', 'passkeys'] as const

// Passkeys shown before "View all": e2e runs and device churn can leave dozens.
const PASSKEYS_SHOWN = 5

function PasskeysSection() {
  const queryClient = useQueryClient()
  const [showAll, setShowAll] = useState(false)
  const passkeys = useQuery({
    queryKey: passkeysKey,
    queryFn: async () => {
      const { data, error } = await authClient.passkey.listUserPasskeys()
      if (error) throw new Error(error.message ?? 'Could not load passkeys')
      // Newest first, so the collapsed list shows the most recent.
      return [...(data ?? [])].sort(
        (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
      )
    },
  })
  const add = useMutation({
    mutationFn: async (name: string) => {
      const result = await authClient.passkey.addPasskey({ name: name || undefined })
      if (result?.error) throw new Error(result.error.message ?? 'Passkey was not added')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: passkeysKey }),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await authClient.passkey.deletePasskey({ id })
      if (error) throw new Error(error.message ?? 'Passkey was not removed')
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: passkeysKey }),
  })

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    add.mutate(String(new FormData(form).get('name') ?? '').trim(), {
      onSuccess: () => form.reset(),
    })
  }

  return (
    <SettingsRow
      id="passkeys"
      title="Passkeys"
      description="Sign in with your device's screen lock or a security key instead of a password. Your password keeps working."
    >
      {passkeys.isPending ? null : passkeys.isError ? (
        <Notice tone="error" title="Passkeys could not be loaded">
          {passkeys.error.message}
        </Notice>
      ) : passkeys.data.length === 0 ? (
        <p className="mb-6 text-sm text-text-muted">No passkeys yet.</p>
      ) : (
        <>
          <ul
            id="passkey-list"
            className="mb-6 flex flex-col divide-y divide-border border-y-2 border-rule"
          >
            {(showAll ? passkeys.data : passkeys.data.slice(0, PASSKEYS_SHOWN)).map((p) => (
              <Reveal
                as="li"
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-semibold">{p.name || 'Unnamed passkey'}</p>
                  <p className="type-meta">
                    {p.createdAt ? (
                      <Timestamp
                        at={new Date(p.createdAt).toISOString()}
                        format="datetime"
                        prefix="Added"
                      />
                    ) : (
                      'Added earlier'
                    )}
                    {p.backedUp ? ' · synced' : ''}
                  </p>
                </div>
                <ConfirmDialog
                  trigger={
                    <Button
                      size="sm"
                      variant="danger"
                      loading={remove.isPending && remove.variables === p.id}
                      aria-label={`Remove ${p.name || 'unnamed passkey'}`}
                    >
                      Remove
                    </Button>
                  }
                  title="Remove this passkey?"
                  confirmLabel="Remove passkey"
                  destructive
                  onConfirm={() => remove.mutate(p.id)}
                >
                  You will no longer be able to sign in with {p.name || 'this passkey'}. Your
                  password keeps working.
                </ConfirmDialog>
              </Reveal>
            ))}
          </ul>
          {passkeys.data.length > PASSKEYS_SHOWN ? (
            <Button
              size="sm"
              variant="secondary"
              aria-expanded={showAll}
              aria-controls="passkey-list"
              onClick={() => setShowAll(!showAll)}
              className="-mt-3 mb-6"
            >
              {showAll ? 'Show fewer' : `View all ${passkeys.data.length} passkeys`}
            </Button>
          ) : null}
        </>
      )}

      <form onSubmit={onAdd} className="flex flex-wrap items-end gap-3">
        <TextInput
          label="Name (optional)"
          name="name"
          placeholder="e.g. Work laptop"
          maxLength={60}
          className="min-w-48 flex-1"
        />
        <Button type="submit" variant="primary" loading={add.isPending}>
          Add a passkey
        </Button>
      </form>
      {add.isError ? (
        <Reveal className="mt-4">
          <Notice tone="error" title="Passkey not added">
            {add.error.message}
          </Notice>
        </Reveal>
      ) : null}
      {remove.isError ? (
        <Reveal className="mt-4">
          <Notice tone="error" title="Passkey not removed">
            {remove.error.message}
          </Notice>
        </Reveal>
      ) : null}
    </SettingsRow>
  )
}

function SignOutButton() {
  const { signOut, pending } = useSignOut()
  return (
    <Button size="sm" variant="danger" loading={pending} onClick={signOut}>
      Sign out
    </Button>
  )
}

/**
 * Self-serve account deletion. better-auth wants the password, or for accounts without one
 * (Google, passkeys only) a session under a day old; otherwise the reader signs in again.
 */
function DangerZone() {
  const queryClient = useQueryClient()
  const [password, setPassword] = useState('')
  const accounts = useQuery({
    queryKey: ['account', 'linked'],
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts()
      if (error) throw new Error(error.message ?? 'Could not load your sign-in methods')
      return data ?? []
    },
  })
  const hasPassword = accounts.data?.some((a) => a.providerId === 'credential') ?? false
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.deleteUser(hasPassword ? { password } : {})
      if (error) {
        if (error.code === 'SESSION_EXPIRED')
          throw new Error('For your security, sign out, sign in again, then delete your account.')
        throw new Error(error.message ?? 'Your account was not deleted.')
      }
    },
    onSuccess: () => {
      queryClient.clear()
      // A full load: nothing cached from the deleted account survives.
      window.location.assign('/login')
    },
    onSettled: () => setPassword(''),
  })

  return (
    <SettingsRow
      id="danger-zone"
      title="Danger zone"
      description="Deleting your account removes your preferences, follows, reading history, feedback and passkeys. It can’t be undone."
    >
      <ConfirmDialog
        trigger={
          <Button variant="danger" loading={remove.isPending} disabled={accounts.isPending}>
            Delete account
          </Button>
        }
        title="Delete your account?"
        confirmLabel="Delete account"
        destructive
        onConfirm={() => remove.mutate()}
        onCancel={() => setPassword('')}
      >
        <p>Everything tied to your account is deleted straight away. This can’t be undone.</p>
        {hasPassword ? (
          <TextInput
            label="Your password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-4"
          />
        ) : null}
      </ConfirmDialog>
      {remove.isError ? (
        <Reveal className="mt-4">
          <Notice tone="error" title="Account not deleted">
            {remove.error.message}
          </Notice>
        </Reveal>
      ) : null}
    </SettingsRow>
  )
}

function ReadingHistorySection() {
  return (
    <SettingsRow id="reading-history" title="Reading history">
      <ReadingHistoryToggle />
    </SettingsRow>
  )
}

// Country choices, sorted by name. Built once: Intl names don't change at runtime.
const SORTED_COUNTRY_OPTIONS = KNOWN_COUNTRIES.map((code) => ({
  value: code,
  label: countryName(code),
})).sort((a, b) => a.label.localeCompare(b.label))

const COUNTRY_OPTIONS = [
  { value: null, label: 'Automatic (where you are)' },
  ...SORTED_COUNTRY_OPTIONS,
]

const LOCALITY_COUNTRY_OPTIONS = [
  { value: null, label: 'Choose a country' },
  ...SORTED_COUNTRY_OPTIONS,
]

function LocalitySection({ fallbackCountry }: { fallbackCountry: string | null }) {
  const preferences = useQuery(queries.preferences())
  const saved = preferences.data?.locality ?? null
  const country = preferences.data?.country ?? fallbackCountry
  const canonical = saved ?? (country ? { city: null, county: null, country } : null)
  return (
    <SettingsRow
      id="local-stories"
      title="Local stories"
      description="Save where you live to see city and county stories before wider news from your country. Without a saved location, Local may use your current country without storing it."
    >
      <LocalityForm
        key={`${saved ? 'saved' : 'suggested'}:${JSON.stringify(canonical)}`}
        canonical={canonical}
        saved={Boolean(saved)}
      />
    </SettingsRow>
  )
}

function LocalityForm({
  canonical,
  saved,
}: {
  canonical: { city: string | null; county: string | null; country: string } | null
  saved: boolean
}) {
  const queryClient = useQueryClient()
  const save = useMutation(savePreferencesMutation(api, queryClient))
  const [city, setCity] = useState(canonical?.city ?? '')
  const [county, setCounty] = useState(canonical?.county ?? '')
  const [country, setCountry] = useState<string | null>(canonical?.country ?? null)
  const normalized = {
    city: city.trim() || null,
    county: county.trim() || null,
    country,
  }
  const dirty =
    normalized.city !== (canonical?.city ?? null) ||
    normalized.county !== (canonical?.county ?? null) ||
    normalized.country !== (canonical?.country ?? null)
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!country) return
    save.mutate({ locality: { city: normalized.city, county: normalized.county, country } })
  }

  return (
    <form onSubmit={submit} aria-label="Local news location">
      <fieldset disabled={save.isPending}>
        <legend className="sr-only">Local news location</legend>
        <div className="grid grid-cols-3 gap-4 max-lg:grid-cols-1">
          <TextInput
            label="City"
            name="city"
            autoComplete="address-level2"
            value={city}
            maxLength={100}
            onChange={(event) => setCity(event.target.value)}
          />
          <TextInput
            label="County or local area"
            name="county"
            autoComplete="address-level1"
            value={county}
            maxLength={100}
            onChange={(event) => setCounty(event.target.value)}
          />
          <Select
            label="Country"
            name="country"
            options={LOCALITY_COUNTRY_OPTIONS}
            value={country}
            onValueChange={setCountry}
          />
        </div>
        <p className="mt-3 text-sm text-text-muted">
          City and county are optional. We do not request or store your precise coordinates.
        </p>
        {save.isError ? (
          <Notice tone="error" title="Location not saved" className="mt-4">
            {save.error.message} Try again.
          </Notice>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="submit" variant="primary" loading={save.isPending} disabled={!country}>
            Save location
          </Button>
          {saved ? (
            <Button
              type="button"
              variant="ghost"
              loading={save.isPending}
              onClick={() => save.mutate({ locality: null })}
            >
              Use automatic country
            </Button>
          ) : null}
        </div>
      </fieldset>
      <ConfirmDialog
        open={blocker.status === 'blocked'}
        title="Discard your location changes?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      >
        Your city, county or country has not been saved.
      </ConfirmDialog>
    </form>
  )
}

function CountrySection() {
  const queryClient = useQueryClient()
  const prefs = useQuery(queries.preferences())
  const save = useMutation(savePreferencesMutation(api, queryClient))
  return (
    <SettingsRow
      id="country"
      title="Your country"
      description="Story pages use a shared political-lean scale. Blindspot uses your country to find stories that one side of its media barely covers."
    >
      <Select
        aria-label="Your country"
        name="country"
        options={COUNTRY_OPTIONS}
        value={prefs.data?.country ?? null}
        disabled={prefs.isPending || save.isPending}
        onValueChange={(country) => save.mutate({ country })}
      />
      {save.isError ? (
        <Notice tone="error" title="Country not saved" className="mt-4">
          {save.error.message} Try again.
        </Notice>
      ) : null}
    </SettingsRow>
  )
}

function FeedSection() {
  return (
    <SettingsRow
      id="your-feed"
      title="Your feed"
      description="Stories matching these move to the top of Briefing, and your regions lead the front page. Nothing else is hidden."
    >
      <div className="grid grid-cols-2 gap-x-column gap-y-6 max-md:grid-cols-1">
        <FeedPicks sections={['regions', 'desks']} />
        <FeedPicks sections={['topics']} />
      </div>
    </SettingsRow>
  )
}

function FollowingSection() {
  const queryClient = useQueryClient()
  const [showAll, setShowAll] = useState(false)
  const follows = useQuery(queries.follows())
  const unfollow = useMutation(setFollowMutation(api, queryClient))
  const items = [...(follows.data?.items ?? [])].sort((a, b) => a.title.localeCompare(b.title))
  return (
    <SettingsRow
      id="following"
      title="Following"
      description="Stories from narratives and publishers you follow rank higher in Briefing."
    >
      {items.length ? (
        <>
          <ul
            id="following-list"
            className="flex flex-col divide-y divide-border border-y border-border"
          >
            {(showAll ? items : items.slice(0, ACCOUNT_LIST_ITEMS_SHOWN)).map((f) => (
              <li
                key={`${f.targetType}-${f.id}`}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span>
                  {f.title}{' '}
                  <span className="type-meta">
                    {f.targetType === 'narrative' ? 'Narrative' : 'Publisher'}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Unfollow ${f.title}`}
                  loading={unfollow.isPending && unfollow.variables?.targetId === f.id}
                  onClick={() =>
                    unfollow.mutate({ targetType: f.targetType, targetId: f.id, follow: false })
                  }
                >
                  Unfollow
                </Button>
              </li>
            ))}
          </ul>
          {items.length > ACCOUNT_LIST_ITEMS_SHOWN ? (
            <Button
              size="sm"
              variant="secondary"
              className="mt-4"
              aria-expanded={showAll}
              aria-controls="following-list"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? 'Show fewer followed items' : 'View all followed items'}
            </Button>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-text-muted">
          Nothing yet. Use Follow on a narrative or publisher page.
        </p>
      )}
    </SettingsRow>
  )
}

function MutedPublishersSection() {
  const queryClient = useQueryClient()
  const [showAll, setShowAll] = useState(false)
  const muted = useQuery(queries.mutedPublishers())
  const change = useMutation(setMutedPublisherMutation(api, queryClient))
  const items = muted.data?.items ?? []
  return (
    <SettingsRow
      id="muted-publishers"
      title="Muted publishers"
      description="Muted publishers do not shape your Briefing. A story still appears when other publishers report it."
    >
      {items.length ? (
        <>
          <ul
            id="muted-publishers-list"
            className="flex flex-col divide-y divide-border border-y border-border"
          >
            {(showAll ? items : items.slice(0, ACCOUNT_LIST_ITEMS_SHOWN)).map((publisher) => (
              <li key={publisher.id} className="flex items-center justify-between gap-3 py-2.5">
                <span>{publisher.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Unmute ${publisher.name}`}
                  loading={change.isPending && change.variables?.publisherId === publisher.id}
                  onClick={() => change.mutate({ publisherId: publisher.id, muted: false })}
                >
                  Unmute
                </Button>
              </li>
            ))}
          </ul>
          {items.length > ACCOUNT_LIST_ITEMS_SHOWN ? (
            <Button
              size="sm"
              variant="secondary"
              className="mt-4"
              aria-expanded={showAll}
              aria-controls="muted-publishers-list"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? 'Show fewer muted publishers' : 'View all muted publishers'}
            </Button>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-text-muted">No muted publishers.</p>
      )}
    </SettingsRow>
  )
}

/** What For You learned from thumbs up / down. Every item can be removed, or all reset. */
function LearnedSignals() {
  const queryClient = useQueryClient()
  const [showAll, setShowAll] = useState(false)
  const signals = useQuery(queries.signals())
  const update = useMutation(updateSignalsMutation(api, queryClient))
  const items = signals.data?.items ?? []
  const more = items.filter((s) => s.weight > 0)
  const less = items.filter((s) => s.weight < 0)
  return (
    <SettingsRow
      id="learned"
      title="Learned from your feedback"
      description="Your thumbs up and down on For You nudge these. Remove one, or reset them all."
    >
      {items.length === 0 ? (
        <p className="text-sm text-text-muted">
          Nothing yet. Use the thumbs on For You cards to see more or less like a story.
        </p>
      ) : (
        <>
          <div id="learned-signals-list">
            {[
              { title: 'More', list: more },
              { title: 'Less', list: less },
            ].map(({ title, list }) =>
              list.length > 0 ? (
                <div key={title} className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-12 font-semibold">{title}</span>
                  {(showAll ? list : list.slice(0, ACCOUNT_LIST_ITEMS_SHOWN)).map((s) => (
                    <span
                      key={`${s.kind}-${s.key}`}
                      className="inline-flex items-center gap-1 border border-border-strong py-0.5 pl-2"
                    >
                      {s.label}
                      <button
                        type="button"
                        aria-label={`Forget ${s.label}`}
                        disabled={update.isPending}
                        onClick={() => update.mutate({ remove: { kind: s.kind, key: s.key } })}
                        className="relative min-h-6 px-1.5 text-text-muted after:absolute after:-inset-2.5 after:content-[''] hover:text-text"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null,
            )}
          </div>
          {more.length > ACCOUNT_LIST_ITEMS_SHOWN || less.length > ACCOUNT_LIST_ITEMS_SHOWN ? (
            <Button
              size="sm"
              variant="secondary"
              className="mb-3"
              aria-expanded={showAll}
              aria-controls="learned-signals-list"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? 'Show fewer learned signals' : 'View all learned signals'}
            </Button>
          ) : null}
          <ConfirmDialog
            trigger={
              <Button size="sm" variant="danger" disabled={update.isPending}>
                Reset all
              </Button>
            }
            title="Reset what For You learned?"
            confirmLabel="Reset"
            destructive
            onConfirm={() => update.mutate({ reset: true })}
          >
            Your thumbs up and down are forgotten and hidden stories come back. Your picks and
            follows stay.
          </ConfirmDialog>
        </>
      )}
    </SettingsRow>
  )
}
