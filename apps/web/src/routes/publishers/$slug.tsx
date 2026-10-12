import { countryName, formatDate, languageName, logoUrl, plural, pluralWord } from '@dn/domain'
import { saveAssessmentMutation } from '@dn/queries'
import {
  type CoverageProfile,
  DESK_LABELS,
  type Desk,
  EVIDENCE_SOURCE_LABELS,
  type EvidenceResponse,
  FUNDING_LABELS,
  fundingModelSchema,
  LEAN_LABELS,
  leanBasisSchema,
  type PublisherAssessment,
  type PublisherDetail,
  publisherLeanSchema,
  REGION_LABELS,
  RELIABILITY_LABELS,
  type Region,
  type ReliabilityLevel,
  reliabilityLevelSchema,
} from '@dn/schemas'
import {
  AssessmentScorecard,
  Badge,
  Button,
  cx,
  deskKey,
  EvidenceAttribution,
  Meter,
  MixBars,
  Notice,
  PublisherLogo,
  SectionLabel,
  Select,
  StoryItem,
  Textarea,
  TextInput,
} from '@dn/ui'
import { ArrowSquareOutIcon, GlobeHemisphereWestIcon, TranslateIcon } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { FollowButton } from '../../components/follow-button.tsx'
import { RouterLink } from '../../components/link.tsx'
import { Page } from '../../components/page.tsx'
import { PreviewTeaser } from '../../components/preview-teaser.tsx'
import { api, orNotFound, queries } from '../../lib/api.ts'
import { seo } from '../../lib/seo.ts'

export const Route = createFileRoute('/publishers/$slug')({
  loader: async ({ context, params }) => {
    // Signed out (e.g. from a shared link): only the public teaser.
    if (context.preview) {
      const preview = await orNotFound(
        context.queryClient.ensureQueryData(queries.preview('publisher', params.slug)),
      )
      return { preview, name: preview.title, now: new Date().toISOString() }
    }
    const p = await orNotFound(context.queryClient.ensureQueryData(queries.publisher(params.slug)))
    return { preview: null, name: p.name, now: new Date().toISOString() }
  },
  head: ({ loaderData, match, params }) => {
    const preview = loaderData?.preview
    return seo({
      origin: match.context.session.origin,
      path: match.pathname,
      title: loaderData?.name ?? 'Publisher',
      description: preview?.description,
      type: 'profile',
      // The publisher's own logo: square, so the small card layout.
      card: preview ? 'summary' : undefined,
      image: preview
        ? { url: logoUrl(params.slug), width: 128, height: 128, alt: preview.title }
        : undefined,
    })
  },
  component: PublisherRoute,
})

function PublisherRoute() {
  const { preview } = Route.useLoaderData()
  return preview ? <PreviewTeaser preview={preview} /> : <PublisherPage />
}

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
          {/* The logo spans the label, name and meta lines; it hides itself if there's none. */}
          <div className="flex items-start gap-5">
            <PublisherLogo slug={p.slug} size={88} />
            <div className="min-w-0 flex-1">
              <p className="type-label text-text-muted">Publisher</p>
              <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                <h1 className="type-headline-lg">{p.name}</h1>
                <FollowButton targetType="publisher" targetId={p.id} name={p.name} />
              </div>
              {/* Spaced items with a muted icon each, rather than a dotted run of codes. */}
              <ul className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 type-meta">
                <li>
                  <a
                    href={`https://${p.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline underline-offset-3 hover:text-text"
                  >
                    {p.domain}
                    <ArrowSquareOutIcon size={14} aria-hidden />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </li>
                {p.countryCode ? (
                  <li className="inline-flex items-center gap-1.5">
                    <GlobeHemisphereWestIcon size={14} aria-hidden />
                    <span className="sr-only">Country: </span>
                    {countryName(p.countryCode)}
                  </li>
                ) : null}
                {p.languages.length ? (
                  <li className="inline-flex items-center gap-1.5">
                    <TranslateIcon size={14} aria-hidden />
                    <span className="sr-only">Languages: </span>
                    {p.languages.map(languageName).join(', ')}
                  </li>
                ) : null}
                {p.kind === 'official' ? <li>Official source</li> : null}
              </ul>
            </div>
          </div>

          <dl className="mt-8 grid grid-cols-2 border-t-2 border-rule sm:grid-cols-3">
            {[
              ['Stories', p.storiesCovered],
              ['First to report', p.firstReports],
              ['Articles seen', p.articleCount],
            ].map(([label, value]) => (
              <div key={label} className="border-b border-border py-4 pr-4">
                <dt className="type-label text-text-muted">{label}</dt>
                <dd className="mt-1 type-numeral">{value}</dd>
              </div>
            ))}
          </dl>

          <CoverageProfileSection profile={p.profile} />
          <AssessmentSection assessment={p.assessment} />
          {isAdmin ? <AssessmentEditor publisher={p} /> : null}

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
                      <span className="type-meta">{c.sharedStories}</span>
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

/** Facts about what this outlet covers vs all published Stories; no ratings. */
function CoverageProfileSection({ profile }: { profile: CoverageProfile }) {
  if (profile.storyCount === 0) return null
  return (
    <section aria-labelledby="profile-heading" className="mt-12">
      <SectionLabel id="profile-heading">Coverage, last {profile.days} days</SectionLabel>
      <div className="grid gap-10 md:grid-cols-2">
        <MixBars
          title={`Desks · ${plural(profile.storyCount, 'story', 'stories')}`}
          entries={profile.desks.slice(0, 6).map((d) => ({
            ...d,
            label: DESK_LABELS[d.key as Desk] ?? d.key,
            // A desk's own key colour already means that desk across the site.
            fillClass: cx(deskKey(d.key as Desk), 'bg-key'),
          }))}
        />
        <MixBars
          title="Regions"
          entries={profile.regions
            .slice(0, 6)
            .map((r) => ({ ...r, label: REGION_LABELS[r.key as Region] ?? r.key }))}
        />
      </div>
      <div className="mt-10 grid gap-10 md:grid-cols-2">
        {profile.officialShare !== null ? (
          <Meter
            value={profile.officialShare}
            label="of its stories also carry an official source (agency, court, regulator)"
          />
        ) : null}
        <div>
          <p className="type-numeral">{profile.missedMajor.count}</p>
          <p className="mt-2 text-sm text-text-secondary">
            widely reported {pluralWord(profile.missedMajor.count, 'story', 'stories')} (4+
            publishers) this week it didn't cover
          </p>
          {profile.missedMajor.examples.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1.5">
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
          ) : null}
        </div>
      </div>
    </section>
  )
}

/** The latest reviewed assessment. Unreviewed evidence is never shown here. */
function AssessmentSection({ assessment }: { assessment: PublisherAssessment | null }) {
  return (
    <section aria-labelledby="assessment-heading" className="mt-12">
      <SectionLabel id="assessment-heading">Assessment</SectionLabel>
      {assessment ? (
        <AssessmentScorecard assessment={assessment} />
      ) : (
        <p className="text-text-secondary">Not assessed yet.</p>
      )}
    </section>
  )
}

const FUNDING_OPTIONS = fundingModelSchema.options.map((f) => ({
  value: f,
  label: FUNDING_LABELS[f],
}))

const RELIABILITY_OPTIONS = [
  { value: null, label: 'Not rated' },
  ...reliabilityLevelSchema.options.map((r) => ({ value: r, label: RELIABILITY_LABELS[r] })),
]

/** Pre-fill the level from the imported Wikipedia label, when there is one. */
function importedReliability(
  evidence: { source: string; value: string }[],
): ReliabilityLevel | null {
  const rsp = evidence.find((e) => e.source === 'wp_rsp')?.value ?? ''
  if (rsp.startsWith('Generally reliable')) return 'reliable'
  if (rsp.startsWith('No consensus') || rsp.startsWith('Mixed')) return 'no_consensus'
  if (rsp.startsWith('Generally unreliable')) return 'unreliable'
  if (rsp.startsWith('Deprecated') || rsp.startsWith('Blacklisted')) return 'deprecated'
  return null
}

type ImportedEvidence = EvidenceResponse['evidence'][number]

/**
 * Pre-fill the lean from hand-checked evidence for the assessment's country. Audience data
 * from the outlet's own country wins over AllSides, which only rates on the US scale; our own
 * estimate is the last resort.
 */
function importedLean(evidence: ImportedEvidence[], country: string | null) {
  const usable = evidence.filter((e) => e.lean && e.countryContext === country)
  return (
    usable.find((e) => e.source === 'reuters_dnr') ??
    usable.find((e) => e.source === 'allsides') ??
    usable.find((e) => e.source === 'domino_estimate') ??
    null
  )
}

const LEAN_BASIS_OPTIONS = [
  { value: 'sourced' as const, label: 'Sourced (survey or rating)' },
  { value: 'estimated' as const, label: 'Estimated (our research)' },
]

const LEAN_OPTIONS = [
  { value: null, label: 'Not assessed' },
  ...publisherLeanSchema.options.map((l) => ({ value: l, label: LEAN_LABELS[l] })),
]

/** Admin: review imported evidence and publish a new assessment version. */
function AssessmentEditor({ publisher }: { publisher: PublisherDetail }) {
  const { slug } = publisher
  const queryClient = useQueryClient()
  const evidence = useQuery(queries.evidence(slug))
  const save = useMutation(saveAssessmentMutation(api, queryClient, slug))
  const current = publisher.assessment
  const suggested = current?.lean
    ? null
    : importedLean(evidence.data?.evidence ?? [], current?.countryContext ?? publisher.countryCode)
  const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim()

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const lean = publisherLeanSchema.safeParse(form.get('lean'))
    const basis = leanBasisSchema.safeParse(form.get('leanBasis'))
    const funding = fundingModelSchema.safeParse(form.get('fundingModel'))
    const level = reliabilityLevelSchema.safeParse(form.get('reliabilityLevel'))
    save.mutate({
      fundingModel: funding.success ? funding.data : 'other',
      ownership: text(form, 'ownership'),
      reliabilityLevel: level.success ? level.data : null,
      reliability: text(form, 'reliability'),
      countryContext: text(form, 'countryContext').toUpperCase() || null,
      lean: lean.success ? lean.data : null,
      leanBasis: lean.success ? (basis.success ? basis.data : 'sourced') : null,
      leanEvidenceUrl: text(form, 'leanEvidenceUrl') || null,
      leanNote: text(form, 'leanNote') || null,
    })
  }

  return (
    <section aria-labelledby="review-heading" className="mt-16">
      <SectionLabel id="review-heading">Review assessment (admin)</SectionLabel>
      <p className="mb-3 text-sm text-text-secondary">
        Imported evidence. Wikidata ownership can be incomplete, so check it before publishing.
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
                {EVIDENCE_SOURCE_LABELS[e.source] ?? e.source}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-6 text-sm text-text-muted">No imported evidence.</p>
      )}
      <EvidenceAttribution
        sources={evidence.data?.evidence.map((e) => e.source) ?? []}
        className="-mt-4 mb-6"
      />
      {suggested ? (
        <p className="mb-6 text-sm text-text-secondary">
          Lean pre-filled from {EVIDENCE_SOURCE_LABELS[suggested.source] ?? suggested.source}. Check
          it before publishing.
        </p>
      ) : null}
      {/* Remount once evidence loads so the reliability pre-fill applies (uncontrolled form). */}
      <form
        key={evidence.isSuccess ? 'ready' : 'loading'}
        onSubmit={onSubmit}
        className="flex max-w-reading flex-col gap-4"
      >
        <Select
          label="Funding model"
          name="fundingModel"
          options={FUNDING_OPTIONS}
          defaultValue={current?.fundingModel ?? 'commercial'}
        />
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
        <Select
          label="Reliability level"
          name="reliabilityLevel"
          options={RELIABILITY_OPTIONS}
          defaultValue={
            current?.reliabilityLevel ?? importedReliability(evidence.data?.evidence ?? [])
          }
        />
        <div className="flex flex-wrap items-end gap-4">
          <Select
            label="Political lean"
            name="lean"
            options={LEAN_OPTIONS}
            defaultValue={current?.lean ?? suggested?.lean ?? null}
          />
          <Select
            label="Lean basis"
            name="leanBasis"
            options={LEAN_BASIS_OPTIONS}
            defaultValue={
              current?.leanBasis ??
              (suggested?.source === 'domino_estimate' ? 'estimated' : 'sourced')
            }
          />
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
          defaultValue={current?.leanEvidenceUrl ?? suggested?.url ?? ''}
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
