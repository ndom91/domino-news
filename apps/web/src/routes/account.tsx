import { countryName, KNOWN_COUNTRIES } from '@dn/domain'
import { savePreferencesMutation, setFollowMutation, updateSignalsMutation } from '@dn/queries'
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
import { createFileRoute } from '@tanstack/react-router'
import type { FormEvent, ReactNode } from 'react'
import { z } from 'zod/mini'
import { FeedPicks } from '../components/feed-picks.tsx'
import { Page, PageTitle } from '../components/page.tsx'
import { ReadingHistoryToggle } from '../components/reading-history.tsx'
import { api, queries } from '../lib/api.ts'
import { authClient } from '../lib/auth-client.ts'
import { useSignOut } from '../lib/sign-out.ts'

const TABS = ['preferences', 'following', 'security'] as const

export const Route = createFileRoute('/account')({
  // An unknown tab falls back to Preferences instead of erroring.
  validateSearch: z.object({ tab: z.catch(z.optional(z.enum(TABS)), undefined) }),
  // Passkeys load in the browser only (WebAuthn client); the rest renders on the server.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.prefetchQuery(queries.preferences()),
      context.queryClient.prefetchQuery(queries.follows()),
    ]),
  head: () => ({ meta: [{ title: 'Account · Domino News' }] }),
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
        <FeedSection />
        <CountrySection />
      </>
    ),
    following: (
      <>
        <FollowingSection />
        <LearnedSignals />
      </>
    ),
    security: (
      <>
        <PasskeysSection />
        <ReadingHistorySection />
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

const passkeysKey = ['account', 'passkeys'] as const

function PasskeysSection() {
  const queryClient = useQueryClient()
  const passkeys = useQuery({
    queryKey: passkeysKey,
    queryFn: async () => {
      const { data, error } = await authClient.passkey.listUserPasskeys()
      if (error) throw new Error(error.message ?? 'Could not load passkeys')
      return data ?? []
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
        <ul className="mb-6 flex flex-col divide-y divide-border border-y-2 border-rule">
          {passkeys.data.map((p) => (
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
                You will no longer be able to sign in with {p.name || 'this passkey'}. Your password
                keeps working.
              </ConfirmDialog>
            </Reveal>
          ))}
        </ul>
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

function ReadingHistorySection() {
  return (
    <SettingsRow id="reading-history" title="Reading history">
      <ReadingHistoryToggle />
    </SettingsRow>
  )
}

// Country choices, sorted by name. Built once: Intl names don't change at runtime.
const COUNTRY_OPTIONS = [
  { value: null, label: 'Automatic (where you are)' },
  ...KNOWN_COUNTRIES.map((code) => ({ value: code, label: countryName(code) })).sort((a, b) =>
    a.label.localeCompare(b.label),
  ),
]

function CountrySection() {
  const queryClient = useQueryClient()
  const prefs = useQuery(queries.preferences())
  const save = useMutation(savePreferencesMutation(api, queryClient))
  return (
    <SettingsRow
      id="country"
      title="Your country"
      description="Stories show the political lean of publishers in this country first, and Blindspot lists stories that one side of its media barely covers."
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
      description="Stories matching these move to the top of For You, and your regions lead the front page. Nothing else is hidden."
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
  const follows = useQuery(queries.follows())
  const unfollow = useMutation(setFollowMutation(api, queryClient))
  return (
    <SettingsRow
      id="following"
      title="Following"
      description="Stories from narratives and publishers you follow rank higher in For You."
    >
      {follows.data?.items.length ? (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {follows.data.items.map((f) => (
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
      ) : (
        <p className="text-sm text-text-muted">
          Nothing yet. Use Follow on a narrative or publisher page.
        </p>
      )}
    </SettingsRow>
  )
}

/** What For You learned from thumbs up / down. Every item can be removed, or all reset. */
function LearnedSignals() {
  const queryClient = useQueryClient()
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
          {[
            { title: 'More', list: more },
            { title: 'Less', list: less },
          ].map(({ title, list }) =>
            list.length > 0 ? (
              <div key={title} className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="w-12 font-semibold">{title}</span>
                {list.map((s) => (
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
