import { formatDateTime } from '@dn/domain'
import { setFollowMutation, updateSignalsMutation } from '@dn/queries'
import { Button, ConfirmDialog, Notice, Reveal, SectionLabel, TextInput } from '@dn/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { FeedPicks } from '../components/feed-picks.tsx'
import { Page, PageTitle } from '../components/page.tsx'
import { ReadingHistoryToggle } from '../components/reading-history.tsx'
import { api, queries } from '../lib/api.ts'
import { authClient } from '../lib/auth-client.ts'
import { useSignOut } from '../lib/sign-out.ts'

export const Route = createFileRoute('/account')({
  // Passkeys load in the browser only (WebAuthn client); the rest renders on the server.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.prefetchQuery(queries.preferences()),
      context.queryClient.prefetchQuery(queries.follows()),
    ]),
  head: () => ({ meta: [{ title: 'Account · Domino News' }] }),
  component: AccountPage,
})

const passkeysKey = ['account', 'passkeys'] as const

// Web-only page: passkey ceremonies need the browser's WebAuthn API.
function AccountPage() {
  const { session } = Route.useRouteContext()
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
    <Page>
      <div className="max-w-2xl">
        <PageTitle>Account</PageTitle>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-text-secondary">
            Signed in as{' '}
            <span className="font-semibold text-text">
              {session.user?.username ?? session.user?.name}
            </span>
          </p>
          <SignOutButton />
        </div>

        <FeedSection />
        <ReadingHistorySection />

        <section aria-labelledby="passkeys-heading" className="mt-10">
          <SectionLabel id="passkeys-heading">Passkeys</SectionLabel>
          <p className="mb-6 max-w-reading text-sm text-text-secondary">
            Sign in with your device's screen lock or a security key instead of a password. Your
            password keeps working.
          </p>

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
                      Added{' '}
                      {p.createdAt
                        ? formatDateTime(new Date(p.createdAt).toISOString())
                        : 'earlier'}
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
        </section>
      </div>
    </Page>
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
    <section aria-labelledby="history-heading" className="mt-10">
      <SectionLabel id="history-heading">Reading history</SectionLabel>
      <ReadingHistoryToggle />
    </section>
  )
}

function FeedSection() {
  const queryClient = useQueryClient()
  const follows = useQuery(queries.follows())
  const unfollow = useMutation(setFollowMutation(api, queryClient))
  return (
    <section id="your-feed" aria-labelledby="feed-heading" className="mt-10 scroll-mt-24">
      <SectionLabel id="feed-heading">Your feed</SectionLabel>
      <p className="mb-5 max-w-reading text-sm text-text-secondary">
        Stories matching these move to the top of For You, and your regions lead the front page.
        Nothing else is hidden.
      </p>
      <FeedPicks />
      <h3 className="mt-8 mb-2 type-label">Following</h3>
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
                  {f.targetType === 'narrative' ? 'Narrative' : 'Outlet'}
                </span>
              </span>
              <Button
                size="sm"
                variant="ghost"
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
          Nothing yet. Use Follow on a narrative or outlet page.
        </p>
      )}
      <LearnedSignals />
    </section>
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
    <>
      <h3 className="mt-8 mb-2 type-label">Learned from your feedback</h3>
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
                      className="min-h-6 px-1.5 text-text-muted hover:text-text"
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
              <Button size="sm" variant="ghost" loading={update.isPending}>
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
    </>
  )
}
