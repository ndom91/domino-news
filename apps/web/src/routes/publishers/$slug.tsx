import { formatDate, plural } from '@dn/domain'
import { saveAssessmentMutation } from '@dn/queries'
import {
  type CoverageProfile,
  DESK_LABELS,
  type Desk,
  type PublisherAssessment,
  type PublisherDetail,
  type PublisherLean,
  publisherLeanSchema,
  REGION_LABELS,
  type Region,
} from '@dn/schemas'
import { Badge, Button, Notice, Select, StoryItem, Textarea, TextInput } from '@dn/ui'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { type FormEvent, useId } from 'react'
import { RouterLink } from '../../components/link.tsx'
import { Page, SectionLabel } from '../../components/page.tsx'
import { api, queries } from '../../lib/api.ts'

export const Route = createFileRoute('/publishers/$slug')({
  loader: async ({ context, params }) => {
    const p = await context.queryClient.ensureQueryData(queries.publisher(params.slug))
    return { name: p.name, now: new Date().toISOString() }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.name} · Domino News` : 'Publisher' }],
  }),
  component: PublisherPage,
})

function PublisherPage() {
  const { slug } = Route.useParams()
  const { now } = Route.useLoaderData()
  const { data: p } = useSuspenseQuery(queries.publisher(slug))
  const isAdmin = Route.useRouteContext().session.user?.isAdmin ?? false
  const maxShared = Math.max(1, ...p.coCoverage.map((c) => c.sharedStories))
  return (
    <Page>
      <div className="grid gap-x-14 gap-y-12 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <p className="type-label text-text-muted">Publisher</p>
          <h1 className="mt-2 type-headline-lg">{p.name}</h1>
          <p className="mt-2 type-meta">
            <a
              href={`https://${p.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-3 hover:text-text"
            >
              {p.domain} ↗
            </a>
            {p.countryCode ? ` · ${p.countryCode}` : ''}
            {p.kind === 'official' ? ' · Official source' : ''}
            {p.languages.length ? ` · ${p.languages.join(', ')}` : ''}
          </p>

          <dl className="mt-8 grid grid-cols-2 border-t-2 border-rule sm:grid-cols-3">
            {[
              ['Stories', p.storiesCovered],
              ['First to report', p.firstReports],
              ['Articles seen', p.articleCount],
            ].map(([label, value]) => (
              <div key={label} className="border-b border-border py-4 pr-4">
                <dt className="type-label text-text-muted">{label}</dt>
                <dd className="mt-1 type-numeral tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <CoverageProfileSection profile={p.profile} />
          <AssessmentSection assessment={p.assessment} />
          {isAdmin ? <AssessmentEditor slug={p.slug} publisher={p} /> : null}

          <section aria-labelledby="recent-heading" className="mt-12">
            <SectionLabel id="recent-heading">Recent stories with {p.name}</SectionLabel>
            {p.recentStories.length === 0 ? (
              <Notice title="No published stories yet" />
            ) : (
              <div className="grid gap-x-8 gap-y-11 md:grid-cols-2">
                {p.recentStories.map((story) => (
                  <StoryItem key={story.id} story={story} now={now} Link={RouterLink} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-10 lg:pt-16">
          <section aria-labelledby="policy-heading">
            <SectionLabel id="policy-heading">Source use</SectionLabel>
            <Badge tone={p.bodyPolicy === 'metadata_only' ? 'neutral' : 'ink'}>
              {p.bodyPolicy === 'metadata_only'
                ? 'Headlines and descriptions only'
                : 'Article text processed, not stored'}
            </Badge>
            {p.policyNote ? (
              <p className="mt-3 text-sm leading-normal text-text-secondary">{p.policyNote}</p>
            ) : null}
            {p.license ? <p className="mt-2 type-meta">Licence: {p.license}</p> : null}
            {p.policyReviewedAt ? (
              <p className="mt-2 type-meta">Reviewed {formatDate(p.policyReviewedAt)}</p>
            ) : null}
          </section>

          <section aria-labelledby="shared-heading">
            <SectionLabel id="shared-heading">Often covers the same stories as</SectionLabel>
            {p.coCoverage.length === 0 ? (
              <p className="text-sm text-text-muted">No shared stories yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {p.coCoverage.map((c) => (
                  <li key={c.publisher.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <Link
                        to="/publishers/$slug"
                        params={{ slug: c.publisher.slug }}
                        className="font-semibold hover:underline underline-offset-4"
                      >
                        {c.publisher.name}
                      </Link>
                      <span className="type-meta tabular-nums">{c.sharedStories}</span>
                    </div>
                    <div aria-hidden className="mt-1 h-1.5 bg-sunken">
                      <div
                        className="h-1.5 bg-text"
                        style={{ width: `${(c.sharedStories / maxShared) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </Page>
  )
}

const pct = (n: number) => `${Math.round(n * 100)}%`

/** Facts about what this outlet covers vs all published Stories; no ratings. */
function CoverageProfileSection({ profile }: { profile: CoverageProfile }) {
  if (profile.storyCount === 0) return null
  return (
    <section aria-labelledby="profile-heading" className="mt-12">
      <SectionLabel id="profile-heading">Coverage, last {profile.days} days</SectionLabel>
      <div className="grid gap-10 md:grid-cols-2">
        <MixBars
          title="Desks"
          entries={profile.desks.slice(0, 6)}
          label={(k) => DESK_LABELS[k as Desk] ?? k}
        />
        <MixBars
          title="Regions"
          entries={profile.regions.slice(0, 6)}
          label={(k) => REGION_LABELS[k as Region] ?? k}
        />
      </div>
      <p className="mt-6 max-w-reading text-sm text-text-secondary">
        Bars show the share of this outlet's {plural(profile.storyCount, 'story', 'stories')}; the
        tick marks the share across all outlets.
        {profile.officialShare !== null
          ? ` ${pct(profile.officialShare)} of its stories also carry an official source.`
          : ''}
      </p>
      {profile.missedMajor.count > 0 ? (
        <div className="mt-6">
          <p className="type-label text-text-muted">
            Not covered:{' '}
            {plural(profile.missedMajor.count, 'widely reported story', 'widely reported stories')}{' '}
            this week
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {profile.missedMajor.examples.map((s) => (
              <li key={s.id}>
                <Link
                  to="/stories/$slug"
                  params={{ slug: s.slug }}
                  className="link-headline font-semibold"
                >
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function MixBars({
  title,
  entries,
  label,
}: {
  title: string
  entries: CoverageProfile['desks']
  label: (key: string) => string
}) {
  return (
    <div>
      <p className="mb-3 type-label text-text-muted">{title}</p>
      <ul className="flex flex-col gap-2.5">
        {entries.map((e) => (
          <li key={e.key} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-sm">
            <span className="truncate">{label(e.key)}</span>
            <span className="relative h-2.5 bg-border" aria-hidden>
              <span className="absolute inset-y-0 left-0 bg-text" style={{ width: pct(e.share) }} />
              <span
                className="absolute -inset-y-1 w-0.5 bg-accent"
                style={{ left: pct(e.overallShare) }}
              />
            </span>
            <span className="text-right tabular-nums">
              {pct(e.share)}
              <span className="sr-only">, all outlets {pct(e.overallShare)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const LEAN_LABELS: Record<PublisherLean, string> = {
  left: 'Left',
  centre_left: 'Centre-left',
  centre: 'Centre',
  centre_right: 'Centre-right',
  right: 'Right',
}

const SOURCE_LABELS: Record<string, string> = {
  wikidata: 'Wikidata',
  wp_rsp: 'Wikipedia perennial sources',
}

/** The latest reviewed assessment. Unreviewed evidence is never shown here. */
function AssessmentSection({ assessment: a }: { assessment: PublisherAssessment | null }) {
  return (
    <section aria-labelledby="assessment-heading" className="mt-12">
      <SectionLabel id="assessment-heading">Assessment</SectionLabel>
      {!a ? (
        <p className="text-text-secondary">Not assessed yet.</p>
      ) : (
        <>
          <dl className="grid gap-5 sm:grid-cols-3">
            <div>
              <dt className="type-label text-text-muted">Ownership</dt>
              <dd className="mt-1">{a.ownership}</dd>
            </div>
            <div>
              <dt className="type-label text-text-muted">Reliability</dt>
              <dd className="mt-1">{a.reliability}</dd>
            </div>
            <div>
              <dt className="type-label text-text-muted">Political lean</dt>
              <dd className="mt-1">
                {a.lean ? (
                  <>
                    {LEAN_LABELS[a.lean]}
                    {a.countryContext ? ` within ${a.countryContext} media` : ''}
                    {a.leanEvidenceUrl ? (
                      <>
                        {' '}
                        <a
                          href={a.leanEvidenceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-4"
                        >
                          source
                        </a>
                      </>
                    ) : null}
                    {a.leanNote ? (
                      <span className="block text-sm text-text-secondary">{a.leanNote}</span>
                    ) : null}
                  </>
                ) : (
                  'Not assessed'
                )}
              </dd>
            </div>
          </dl>
          {a.evidence.length > 0 ? (
            <ul className="mt-5 flex flex-col gap-1 text-sm text-text-secondary">
              {a.evidence.map((e) => (
                <li key={`${e.source}-${e.value}`}>
                  {e.value} ·{' '}
                  <a
                    href={e.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-4"
                  >
                    {SOURCE_LABELS[e.source] ?? e.source}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-4 type-meta">
            Reviewed {formatDate(a.reviewedAt)} · {a.methodologyVersion}. Ownership from Wikidata
            (CC0); reliability labels from Wikipedia's perennial sources list (CC BY-SA 4.0). Lean
            is relative to the outlet's own country, and only shown with a cited source.
          </p>
        </>
      )}
    </section>
  )
}

const LEAN_OPTIONS = [
  { value: null, label: 'Not assessed' },
  ...publisherLeanSchema.options.map((l) => ({ value: l, label: LEAN_LABELS[l] })),
]

/** Admin: review imported evidence and publish a new assessment version. */
function AssessmentEditor({ slug, publisher }: { slug: string; publisher: PublisherDetail }) {
  const queryClient = useQueryClient()
  const evidence = useQuery(queries.evidence(slug))
  const save = useMutation(saveAssessmentMutation(api, queryClient, slug))
  const leanId = useId()
  const current = publisher.assessment
  const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const lean = publisherLeanSchema.safeParse(form.get('lean'))
    save.mutate({
      ownership: text(form, 'ownership'),
      reliability: text(form, 'reliability'),
      countryContext: text(form, 'countryContext').toUpperCase() || null,
      lean: lean.success ? lean.data : null,
      leanEvidenceUrl: text(form, 'leanEvidenceUrl') || null,
      leanNote: text(form, 'leanNote') || null,
    })
  }

  return (
    <section aria-labelledby="review-heading" className="mt-10 border-t-2 border-rule pt-6">
      <SectionLabel id="review-heading">Review assessment (admin)</SectionLabel>
      <p className="mb-3 text-sm text-text-secondary">
        Imported evidence. Refresh it with <code>pnpm cli assessments:import</code>. Wikidata
        ownership can be incomplete, so check it before publishing.
      </p>
      {evidence.data?.evidence.length ? (
        <ul className="mb-6 flex flex-col gap-1 text-sm">
          {evidence.data.evidence.map((e) => (
            <li key={`${e.source}-${e.value}`}>
              <span className="type-label text-text-muted">{e.dimension}</span> {e.value} ·{' '}
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                {SOURCE_LABELS[e.source] ?? e.source}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-6 text-sm text-text-muted">No imported evidence.</p>
      )}
      <form onSubmit={onSubmit} className="flex max-w-reading flex-col gap-4">
        <Textarea
          label="Ownership and funding"
          name="ownership"
          rows={2}
          required
          maxLength={500}
          defaultValue={current?.ownership ?? ''}
        />
        <Textarea
          label="Reliability"
          name="reliability"
          rows={2}
          required
          maxLength={500}
          defaultValue={current?.reliability ?? ''}
        />
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={leanId} className="type-label">
              Political lean
            </label>
            <Select
              id={leanId}
              name="lean"
              options={LEAN_OPTIONS}
              defaultValue={current?.lean ?? null}
            />
          </div>
          <TextInput
            label="Country context"
            name="countryContext"
            maxLength={2}
            defaultValue={current?.countryContext ?? publisher.countryCode ?? ''}
            className="w-28"
          />
        </div>
        <TextInput
          label="Lean source (required with a lean, e.g. Reuters Digital News Report)"
          name="leanEvidenceUrl"
          type="url"
          defaultValue={current?.leanEvidenceUrl ?? ''}
        />
        <TextInput
          label="Lean note (optional)"
          name="leanNote"
          maxLength={500}
          defaultValue={current?.leanNote ?? ''}
        />
        <div>
          <Button type="submit" variant="primary" loading={save.isPending}>
            Publish assessment
          </Button>
        </div>
        {save.isError ? (
          <Notice tone="error" title="Assessment not published">
            {save.error.message}
          </Notice>
        ) : null}
        {save.isSuccess ? (
          <p className="text-sm text-text-secondary">Published as a new version.</p>
        ) : null}
      </form>
    </section>
  )
}
