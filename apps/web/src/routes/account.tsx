import { formatDateTime } from '@dn/domain'
import { savePreferencesMutation } from '@dn/queries'
import { REGION_LABELS, REGIONS } from '@dn/schemas'
import { Button, ConfirmDialog, Notice, Select, TextInput } from '@dn/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { type FormEvent, useId, useState } from 'react'
import { Page, PageTitle, SectionLabel } from '../components/page.tsx'
import { api, queries } from '../lib/api.ts'
import { authClient } from '../lib/auth-client.ts'

export const Route = createFileRoute('/account')({
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

        <EditionSection />

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
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
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
                </li>
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
            <Notice tone="error" title="Passkey not added" className="mt-4">
              {add.error.message}
            </Notice>
          ) : null}
          {remove.isError ? (
            <Notice tone="error" title="Passkey not removed" className="mt-4">
              {remove.error.message}
            </Notice>
          ) : null}
        </section>
      </div>
    </Page>
  )
}

function SignOutButton() {
  const router = useRouter()
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)
  return (
    <Button
      size="sm"
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
  )
}

const EDITION_OPTIONS = [
  { value: null, label: 'No preference' },
  ...REGIONS.map((r) => ({ value: r, label: REGION_LABELS[r] })),
]

function EditionSection() {
  const queryClient = useQueryClient()
  const prefs = useQuery(queries.preferences())
  const save = useMutation(savePreferencesMutation(api, queryClient))
  const selectId = useId()

  return (
    <section aria-labelledby="edition-heading" className="mt-10">
      <SectionLabel id="edition-heading">News edition</SectionLabel>
      <p className="mb-4 max-w-reading text-sm text-text-secondary">
        Stories about this region lead your feed. Everything else still appears.
      </p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label htmlFor={selectId} className="type-label">
          Region
        </label>
        <Select
          id={selectId}
          options={EDITION_OPTIONS}
          value={prefs.data?.edition ?? null}
          disabled={prefs.isPending || save.isPending}
          onValueChange={(edition) => save.mutate({ edition })}
        />
      </div>
      {save.isError ? (
        <Notice tone="error" title="Edition not saved" className="mt-4">
          {save.error.message}
        </Notice>
      ) : null}
    </section>
  )
}
