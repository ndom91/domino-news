import { regionForCountry } from '@dn/domain'
import { savePreferencesMutation, setFollowMutation } from '@dn/queries'
import { REGION_LABELS, REGIONS, type Region } from '@dn/schemas'
import { Button, Notice } from '@dn/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod/mini'
import { Chips, FeedPicks } from '../components/feed-picks.tsx'
import { Page } from '../components/page.tsx'
import { api, queries } from '../lib/api.ts'
import { safeNext } from '../lib/session.ts'

export const Route = createFileRoute('/onboarding')({
  validateSearch: z.object({ next: z.optional(z.string()) }),
  head: () => ({ meta: [{ title: 'Welcome · Domino Wire' }] }),
  component: OnboardingPage,
})

const STEPS = [
  {
    title: 'Where do you follow the news?',
    text: 'Stories about these regions lead your front page and rank higher in Briefing.',
  },
  {
    title: 'What do you want more of?',
    text: 'Pick broad desks, specific topics, or both. You can change these any time on your account page.',
  },
  {
    title: 'Follow a few publishers',
    text: 'Stories they cover rank higher in Briefing. Nothing else is hidden.',
  },
] as const

/** First-run setup: three skippable steps, shown once. Every pick saves as it's made. */
function OnboardingPage() {
  const { next } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const finish = useMutation(savePreferencesMutation(api, queryClient))
  const [step, setStep] = useState(0)
  const last = step === STEPS.length - 1
  const current = STEPS[step] ?? STEPS[0]
  const target = safeNext(next, '/briefing')

  function done() {
    finish.mutate({ onboarded: true }, { onSuccess: () => navigate({ to: target, replace: true }) })
  }

  return (
    <Page className="max-w-reading!">
      <p className="type-label text-text-muted">
        Step {step + 1} of {STEPS.length}
      </p>
      <h1 className="mt-2 type-headline-lg">{current.title}</h1>
      <p className="mt-3 mb-8 text-md text-text-secondary">{current.text}</p>

      {step === 0 ? <FeedPicks sections={['regions']} /> : null}
      {step === 1 ? <FeedPicks sections={['desks', 'topics']} /> : null}
      {step === 2 ? <PublisherPicker /> : null}

      <div className="mt-10 flex flex-wrap items-center gap-4 border-t-2 border-rule pt-6">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        ) : null}
        {last ? (
          <Button variant="primary" loading={finish.isPending} onClick={done}>
            Show my feed
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setStep(step + 1)}>
            Next
          </Button>
        )}
        <Button variant="ghost" disabled={finish.isPending} onClick={done} className="ml-auto">
          Skip for now
        </Button>
      </div>
      {finish.isError ? (
        <Notice tone="error" title="Could not save" className="mt-4">
          {finish.error.message}
        </Notice>
      ) : null}
    </Page>
  )
}

/** Newsrooms grouped by region as follow chips, like the other steps. Official sources are left out. */
function PublisherPicker() {
  const queryClient = useQueryClient()
  const publishers = useQuery(queries.publishers())
  const follows = useQuery(queries.follows())
  const save = useMutation(setFollowMutation(api, queryClient))
  if (publishers.isPending) return <p className="text-text-muted">Loading publishers…</p>
  if (publishers.isError) {
    return (
      <Notice tone="error" title="Publishers could not be loaded">
        You can follow publishers later from their pages.
      </Notice>
    )
  }
  const followed = (follows.data?.items ?? [])
    .filter((f) => f.targetType === 'publisher')
    .map((f) => f.id)
  const newsrooms = publishers.data.items.filter((p) => p.kind === 'newsroom')
  const nameOf = new Map(newsrooms.map((p) => [p.id, p.name]))
  const byRegion = new Map<Region | 'global', string[]>()
  for (const p of newsrooms.toSorted((a, b) => a.name.localeCompare(b.name))) {
    const region = regionForCountry(p.countryCode) ?? 'global'
    byRegion.set(region, [...(byRegion.get(region) ?? []), p.id])
  }
  // 'global' is in REGIONS; move it last so "International" closes the list.
  const groups = [...REGIONS.filter((r) => r !== 'global'), 'global' as const].filter((r) =>
    byRegion.has(r),
  )
  return (
    <div className="flex flex-col gap-6">
      {groups.map((region) => (
        <Chips
          key={region}
          label={region === 'global' ? 'International' : REGION_LABELS[region]}
          options={byRegion.get(region) ?? []}
          labelOf={(id) => nameOf.get(id) ?? id}
          selected={followed}
          disabled={follows.isPending || save.isPending}
          onToggle={(id) =>
            save.mutate({ targetType: 'publisher', targetId: id, follow: !followed.includes(id) })
          }
        />
      ))}
      {save.isError ? (
        <Notice tone="error" title="Not saved">
          {save.error.message}
        </Notice>
      ) : null}
    </div>
  )
}
