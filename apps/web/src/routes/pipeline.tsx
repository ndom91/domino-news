import { plural, relativeTime } from '@dn/domain'
import {
  FAILED_JOB_RETENTION_DAYS,
  type FailedJob,
  INFERENCE_SETTINGS_LIMITS,
  type MatchHealth,
  type OpsAction,
  type OpsStatus,
} from '@dn/schemas'
import {
  Badge,
  Button,
  ConfirmDialog,
  Notice,
  SectionLabel,
  Skeleton,
  Tabs,
  TextInput,
  Tooltip,
} from '@dn/ui'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { z } from 'zod/mini'
import { DisclosureChevron } from '../components/disclosure-chevron.tsx'
import { Page, PageTitle } from '../components/page.tsx'
import { api, queries } from '../lib/api.ts'

export const Route = createFileRoute('/pipeline')({
  // UI guard only; the /api/v1/ops endpoints enforce admin themselves.
  beforeLoad: ({ context }) => {
    if (!context.session.user?.isAdmin) throw redirect({ to: '/' })
  },
  // ?failed=<queue> filters the Failed jobs section to one queue; section keeps diagnostics linkable.
  validateSearch: z.object({
    failed: z.catch(z.optional(z.string()), undefined),
    section: z.catch(z.optional(z.enum(['overview', 'inference', 'sources', 'health'])), undefined),
  }),
  head: () => ({ meta: [{ title: 'Pipeline · Domino Wire' }] }),
  component: OpsPage,
})

type PipelineSection = 'overview' | 'inference' | 'sources' | 'health'

/** Runs an ops action and refreshes the status and failed-jobs views. */
function useOpsAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: OpsAction) => api.runOpsAction(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ops'] }),
  })
}

// Same key for one job's buttons, so only the pressed one shows pending.
const actionKey = (a: OpsAction) =>
  'queue' in a ? `${a.action}:${a.queue}:${a.ids?.join(',') ?? 'all'}` : a.action

// Internal diagnostics. Polls every 30s; not a production admin console.
function OpsPage() {
  const status = useQuery(queries.ops())
  const { failed, section } = Route.useSearch()
  const navigate = Route.useNavigate()
  const action = useOpsAction()
  const running = (a: OpsAction['action']) =>
    action.isPending && action.variables && actionKey(action.variables) === a

  if (status.isPending) {
    return <PipelineSkeleton />
  }
  if (status.isError) {
    return (
      <Page>
        <PageTitle>Pipeline</PageTitle>
        <Notice tone="error" title="Pipeline status unavailable">
          {status.error.message}
        </Notice>
      </Page>
    )
  }
  const s = status.data
  const p = s.pipeline
  const activeSection: PipelineSection = section ?? 'overview'

  return (
    <Page>
      <PageTitle
        meta={
          <>
            Inference: <strong className="font-semibold text-text">{s.inferenceMode}</strong> ·
            Backfill:{' '}
            <strong className="font-semibold text-text">
              {s.backfillPaused ? 'paused' : 'running'}
            </strong>
          </>
        }
      >
        Pipeline
      </PageTitle>
      <div className="-mt-4 flex flex-wrap gap-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => action.mutate({ action: 'poll_all_feeds' })}
            loading={running('poll_all_feeds')}
          >
            Poll feeds now
          </Button>
          {s.backfillPaused ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => action.mutate({ action: 'resume_backfill' })}
              loading={running('resume_backfill')}
            >
              Resume backfill
            </Button>
          ) : (
            <ConfirmDialog
              trigger={
                <Button size="sm" loading={running('pause_backfill')}>
                  Pause backfill
                </Button>
              }
              title="Pause backfill?"
              confirmLabel="Pause backfill"
              onConfirm={() => action.mutate({ action: 'pause_backfill' })}
            >
              Older articles stop being admitted until you resume. Fresh articles keep flowing.
            </ConfirmDialog>
          )}
          <ConfirmDialog
            trigger={
              <Button size="sm" loading={running('rebuild_search')}>
                Rebuild search index
              </Button>
            }
            title="Rebuild the search index?"
            confirmLabel="Rebuild index"
            onConfirm={() => action.mutate({ action: 'rebuild_search' })}
          >
            Typesense is rebuilt from Postgres and the alias swaps when it finishes. This can take a
            while on a large database.
          </ConfirmDialog>
        </div>
      </div>
      {action.isError ? (
        <Notice tone="error" title="Action failed" className="mt-4">
          {action.error.message}
        </Notice>
      ) : null}

      <Tabs
        aria-label="Pipeline sections"
        className="mt-8"
        value={activeSection}
        onValueChange={(next) => navigate({ search: { failed, section: next } })}
        tabs={[
          {
            value: 'overview',
            label: 'Overview',
            content: <OverviewSection pipeline={p} queues={s.queues} recentRuns={s.recentRuns} />,
          },
          {
            value: 'inference',
            label: 'Inference',
            content: <InferenceSection inference={s.inference} />,
          },
          {
            value: 'sources',
            label: 'Sources',
            content: (
              <>
                <FeedsSection feeds={s.feeds} />
                <FeedErrorsSection feeds={s.feeds} />
              </>
            ),
          },
          {
            value: 'health',
            label: 'Health',
            content: (
              <>
                <MatchHealthSection />
                <FailedJobs queue={failed ?? null} />
              </>
            ),
          },
        ]}
      />
    </Page>
  )
}

function PipelineSkeleton() {
  return (
    <Page>
      <PageTitle>Pipeline</PageTitle>
      <div className="-mt-4 flex gap-2" aria-hidden="true">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="mt-8 flex gap-6 border-b border-border pb-0" aria-hidden="true">
        <Skeleton className="mb-3 h-4 w-16" />
        <Skeleton className="mb-3 h-4 w-16" />
        <Skeleton className="mb-3 h-4 w-16" />
        <Skeleton className="mb-3 h-4 w-16" />
      </div>
      <div className="mt-8" aria-busy="true">
        <span className="sr-only">Loading pipeline status…</span>
        <dl className="grid grid-cols-2 border-t-2 border-rule sm:grid-cols-4">
          {['articles', 'stories', 'narratives', 'outbox'].map((key) => (
            <div key={key} className="border-b border-border py-4 pr-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-3 h-7 w-12" />
              <Skeleton className="mt-2 h-3 w-28" />
            </div>
          ))}
        </dl>
        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      </div>
    </Page>
  )
}

function OverviewSection({
  pipeline,
  queues,
  recentRuns,
}: Pick<OpsStatus, 'pipeline' | 'queues' | 'recentRuns'>) {
  return (
    <>
      <dl className="grid grid-cols-2 border-t-2 border-rule sm:grid-cols-4">
        <Stat
          label="Articles"
          value={pipeline.articles}
          note={`${pipeline.articlesEmbedded} embedded · ${pipeline.articlesMatched} in stories`}
        />
        <Stat
          label="Stories"
          value={pipeline.stories}
          note={`${pipeline.storiesPublished} published`}
        />
        <Stat label="Narratives" value={pipeline.narratives} />
        <Stat
          label="Search outbox"
          value={pipeline.outboxPending}
          note={`${pipeline.outboxFailed} dead · oldest ${pipeline.oldestOutboxAgeSeconds ?? 0}s`}
        />
      </dl>
      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section className="min-w-0" aria-labelledby="queues-heading">
          <SectionLabel id="queues-heading">Queues</SectionLabel>
          <Table head={['Queue', 'Queued', 'Active', 'Failed', 'Oldest']}>
            {queues.map((q) => (
              <tr key={q.name}>
                <Td mono>{q.name}</Td>
                <Td>{q.queued}</Td>
                <Td>{q.active}</Td>
                <Td>
                  {q.failed > 0 ? (
                    <Link
                      to="/pipeline"
                      search={{ failed: q.name, section: 'health' }}
                      hash="failed-jobs"
                      aria-label={`${plural(q.failed, 'failed job')} in ${q.name}`}
                      className="text-error underline underline-offset-4"
                    >
                      {q.failed}
                    </Link>
                  ) : (
                    0
                  )}
                </Td>
                <Td>{q.oldestQueuedAgeSeconds ? `${q.oldestQueuedAgeSeconds}s` : '–'}</Td>
              </tr>
            ))}
          </Table>
        </section>
        <section className="min-w-0" aria-labelledby="runs-heading">
          <SectionLabel id="runs-heading">Recent analysis runs</SectionLabel>
          <Table head={['Operation', 'Model', 'Status', 'Started']}>
            {recentRuns.map((r) => (
              <tr key={r.id}>
                <Td mono>{r.operation}</Td>
                <Td mono>{r.modelId}</Td>
                <Td>
                  <Badge
                    tone={
                      r.status === 'failed'
                        ? 'error'
                        : r.status === 'running'
                          ? 'warning'
                          : r.status === 'succeeded'
                            ? 'success'
                            : 'neutral'
                    }
                  >
                    {r.status}
                  </Badge>
                </Td>
                <Td>{relativeTime(r.startedAt)}</Td>
              </tr>
            ))}
          </Table>
        </section>
      </div>
    </>
  )
}

function InferenceSection({ inference }: { inference: OpsStatus['inference'] }) {
  const jobs = inference.summaryJobs
  const assessments = inference.updateAssessments
  return (
    <section aria-labelledby="inference-heading">
      <SectionLabel id="inference-heading">Inference work</SectionLabel>
      <p className="mb-4 max-w-reading text-sm text-text-secondary">
        Last {inference.windowHours} hours. Stale summary jobs are queue churn that exited before
        inference; compare them with recorded summaries before adding stronger coalescing.
      </p>
      <dl className="grid grid-cols-2 border-t-2 border-rule sm:grid-cols-4">
        <StatText
          label="Summary jobs"
          value={String(jobs.completed)}
          note={`${jobs.recorded} recorded · ${jobs.stale} stale`}
        />
        <StatText
          label="Metadata skips"
          value={String(jobs.prefiltered)}
          note={`${jobs.corroborationOnly} model corroborations · ${jobs.uncertain} uncertain`}
        />
        <StatText
          label="Update assessments"
          value={String(assessments.succeeded)}
          note={`${assessments.failed} failed · ${duration(assessments.averageDurationSeconds)} average`}
        />
        <StatText
          label="No revision"
          value={String(jobs.corroborationOnly + jobs.uncertain)}
          note="Assessment found no material update"
        />
      </dl>
      <InferenceControls settings={inference.settings} />
    </section>
  )
}

function InferenceControls({ settings }: { settings: OpsStatus['inference']['settings'] }) {
  const action = useOpsAction()
  const formKey = `${settings.publishedSummaryDebounceSeconds}:${settings.summaryUpdateAssessmentMaxArticles}`
  return (
    <section aria-labelledby="inference-controls-heading" className="mt-10 max-w-3xl">
      <SectionLabel id="inference-controls-heading">Inference controls</SectionLabel>
      <p className="mb-4 text-sm text-text-secondary">
        These changes apply to newly scheduled published-story updates. They do not restart workers
        or alter jobs already queued.
      </p>
      <form
        key={formKey}
        className="border-y-2 border-text"
        onSubmit={(event) => {
          event.preventDefault()
          const values = new FormData(event.currentTarget)
          action.mutate({
            action: 'update_inference_settings',
            settings: {
              publishedSummaryDebounceSeconds: Number(values.get('debounceSeconds')),
              summaryUpdateAssessmentMaxArticles: Number(values.get('maxAssessmentArticles')),
            },
          })
        }}
      >
        <fieldset>
          <legend className="sr-only">Published-story update controls</legend>
          <div className="divide-y divide-border">
            <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center">
              <div>
                <h3 className="type-label text-text">Published-story debounce</h3>
                <p className="mt-1 text-sm text-text-secondary">
                  Wait before assessing a burst of reporting.{' '}
                  {INFERENCE_SETTINGS_LIMITS.publishedSummaryDebounceSeconds.min}–
                  {INFERENCE_SETTINGS_LIMITS.publishedSummaryDebounceSeconds.max} seconds.
                </p>
              </div>
              <TextInput
                name="debounceSeconds"
                type="number"
                inputMode="numeric"
                min={INFERENCE_SETTINGS_LIMITS.publishedSummaryDebounceSeconds.min}
                max={INFERENCE_SETTINGS_LIMITS.publishedSummaryDebounceSeconds.max}
                step={30}
                defaultValue={settings.publishedSummaryDebounceSeconds}
                label="Published-story debounce in seconds"
                hideLabel
              />
            </div>
            <div className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-center">
              <div>
                <h3 className="type-label text-text">Assessment articles</h3>
                <p className="mt-1 text-sm text-text-secondary">
                  Distinct publishers considered for each update.{' '}
                  {INFERENCE_SETTINGS_LIMITS.summaryUpdateAssessmentMaxArticles.min}–
                  {INFERENCE_SETTINGS_LIMITS.summaryUpdateAssessmentMaxArticles.max} publishers.
                </p>
              </div>
              <TextInput
                name="maxAssessmentArticles"
                type="number"
                inputMode="numeric"
                min={INFERENCE_SETTINGS_LIMITS.summaryUpdateAssessmentMaxArticles.min}
                max={INFERENCE_SETTINGS_LIMITS.summaryUpdateAssessmentMaxArticles.max}
                step={1}
                defaultValue={settings.summaryUpdateAssessmentMaxArticles}
                label="Assessment article count"
                hideLabel
              />
            </div>
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3 border-t border-border py-4">
          <Button
            type="submit"
            variant="primary"
            loading={action.isPending && action.variables?.action === 'update_inference_settings'}
          >
            Save inference controls
          </Button>
          {action.isError && action.variables?.action === 'update_inference_settings' ? (
            <p className="mt-2 text-sm font-semibold text-error" role="alert">
              {action.error.message}
            </p>
          ) : null}
        </div>
      </form>
      <section aria-labelledby="runtime-capacity-heading" className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 id="runtime-capacity-heading" className="type-label text-text">
            Worker capacity
          </h3>
          <p className="type-meta">Set in the environment · restart required</p>
        </div>
        <dl className="mt-3 grid grid-cols-2 border-t border-border">
          <StatText label="Embedding" value={String(settings.embeddingConcurrency)} />
          <StatText label="Generation" value={String(settings.generationConcurrency)} />
        </dl>
      </section>
    </section>
  )
}

function FailedJobs({ queue }: { queue: string | null }) {
  const jobs = useInfiniteQuery(queries.failedJobs(queue))
  const action = useOpsAction()
  const items = jobs.data?.pages.flatMap((p) => p.items) ?? []
  const pending = (a: OpsAction) =>
    action.isPending &&
    action.variables !== undefined &&
    actionKey(action.variables) === actionKey(a)

  return (
    <section id="failed-jobs" aria-labelledby="failed-heading" className="mt-10 scroll-mt-24">
      <SectionLabel id="failed-heading">Failed jobs</SectionLabel>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {queue ? (
            <>
              Showing <span className="font-semibold text-text">{queue}</span> ·{' '}
              <Link
                to="/pipeline"
                search={{ section: 'health' }}
                hash="failed-jobs"
                className="underline underline-offset-4"
              >
                Show all queues
              </Link>
              {' · '}
            </>
          ) : (
            'Jobs that used up their retries. '
          )}
          Kept for {plural(FAILED_JOB_RETENTION_DAYS, 'day')}.
        </p>
        {queue && items.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <ConfirmDialog
              trigger={
                <Button size="sm" loading={pending({ action: 'retry_jobs', queue })}>
                  Retry all
                </Button>
              }
              title={`Retry every failed job in ${queue}?`}
              confirmLabel="Retry all"
              onConfirm={() => action.mutate({ action: 'retry_jobs', queue })}
            >
              Each job goes back in the queue and runs again, which can mean many model calls.
            </ConfirmDialog>
            <ConfirmDialog
              trigger={
                <Button
                  size="sm"
                  variant="danger"
                  loading={pending({ action: 'dismiss_jobs', queue })}
                >
                  Dismiss all
                </Button>
              }
              title={`Dismiss every failed job in ${queue}?`}
              confirmLabel="Dismiss all"
              destructive
              onConfirm={() => action.mutate({ action: 'dismiss_jobs', queue })}
            >
              The failed jobs are deleted. The work they were doing won't run unless something
              queues it again.
            </ConfirmDialog>
          </div>
        ) : null}
      </div>
      {action.isError ? (
        <Notice tone="error" title="Action failed" className="mb-4">
          {action.error.message} Try again.
        </Notice>
      ) : null}
      {jobs.isPending ? (
        <FailedJobsSkeleton />
      ) : jobs.isError ? (
        <Notice tone="error" title="Failed jobs could not be loaded">
          {jobs.error.message}
        </Notice>
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted">No failed jobs{queue ? ` in ${queue}` : ''}.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {items.map((job) => (
            <li key={job.id}>
              <FailedJobRow
                job={job}
                retrying={pending({ action: 'retry_jobs', queue: job.queue, ids: [job.id] })}
                dismissing={pending({ action: 'dismiss_jobs', queue: job.queue, ids: [job.id] })}
                onRetry={() =>
                  action.mutate({ action: 'retry_jobs', queue: job.queue, ids: [job.id] })
                }
                onDismiss={() =>
                  action.mutate({ action: 'dismiss_jobs', queue: job.queue, ids: [job.id] })
                }
              />
            </li>
          ))}
        </ul>
      )}
      {jobs.hasNextPage ? (
        <Button
          size="sm"
          className="mt-4"
          loading={jobs.isFetchingNextPage}
          onClick={() => jobs.fetchNextPage()}
        >
          Show more failed jobs
        </Button>
      ) : null}
    </section>
  )
}

function FailedJobRow({
  job,
  retrying,
  dismissing,
  onRetry,
  onDismiss,
}: {
  job: FailedJob
  retrying: boolean
  dismissing: boolean
  onRetry: () => void
  onDismiss: () => void
}) {
  return (
    <details className="t-acc group">
      <summary className="flex cursor-pointer list-none gap-3 py-3 text-sm [&::-webkit-details-marker]:hidden">
        {/* A first-line-high box keeps the icon level with the queue name. */}
        <span className="flex h-5 items-center">
          <DisclosureChevron className="text-text-muted" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-3">
            <span className="text-xs font-semibold">{job.queue}</span>
            <span className="type-meta">
              {job.failedAt ? `failed ${relativeTime(job.failedAt)}` : 'failed'} · {job.attempts} of{' '}
              {job.maxAttempts} attempts
            </span>
          </span>
          <span className="mt-0.5 block truncate text-error">
            {job.error ?? 'No error message'}
          </span>
          {job.target ? (
            <span className="block truncate text-text-secondary">{job.target.title}</span>
          ) : null}
        </span>
      </summary>
      {/* Indented under the summary text, with a rule so the panel reads as one job. */}
      <div className="mb-5 ml-7 flex flex-col divide-y divide-border border-l-2 border-border-strong pl-5">
        <div className="flex flex-wrap gap-2 pb-4">
          <Button size="sm" loading={retrying} onClick={onRetry}>
            Retry job
          </Button>
          <Button size="sm" variant="danger" loading={dismissing} onClick={onDismiss}>
            Dismiss job
          </Button>
        </div>
        <Detail label="Error">
          <pre className="bg-error-subtle p-3 text-xs whitespace-pre-wrap break-words text-error">
            {job.error ?? 'No error message'}
          </pre>
        </Detail>
        {job.target ? (
          <Detail label={job.target.type === 'story' ? 'Story' : 'Article'}>
            <p className="text-sm">
              {job.target.href ? (
                <a
                  href={job.target.href}
                  {...(job.target.type === 'article'
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                  className="underline underline-offset-4"
                >
                  {job.target.title}
                </a>
              ) : (
                job.target.title
              )}
              <span className="ml-2 type-meta">{job.target.id}</span>
            </p>
          </Detail>
        ) : null}
        {job.runs.length > 0 ? (
          <Detail label={`Recent attempts (${job.runs.length})`}>
            <Table head={['Started', 'Status', 'Prompt', 'Error']}>
              {job.runs.map((r) => (
                <tr key={r.id}>
                  <Td>{relativeTime(r.startedAt)}</Td>
                  <Td>
                    <Badge
                      tone={
                        r.status === 'failed'
                          ? 'error'
                          : r.status === 'succeeded'
                            ? 'success'
                            : 'warning'
                      }
                    >
                      {r.status}
                    </Badge>
                  </Td>
                  {/* "pending" = the call failed before the model reported its prompt version. */}
                  <Td mono>{r.promptVersion === 'pending' ? '–' : r.promptVersion}</Td>
                  <Td>
                    <span className="break-words text-xs text-text-secondary">
                      {r.error ?? '–'}
                    </span>
                  </Td>
                </tr>
              ))}
            </Table>
          </Detail>
        ) : null}
        {job.stack ? (
          <Fold label="Stack trace">
            <pre className="max-h-64 overflow-auto bg-sunken p-3 text-xs">{job.stack}</pre>
          </Fold>
        ) : null}
        <Fold label="Payload">
          <pre className="max-h-64 overflow-auto bg-sunken p-3 text-xs">
            {JSON.stringify(job.payload, null, 2)}
          </pre>
        </Fold>
        <p className="pt-4 type-meta">
          Job {job.id} · queued {relativeTime(job.createdAt)}
        </p>
      </div>
    </details>
  )
}

/** A detail that starts folded: long, rarely needed output (stack trace, payload). */
function Fold({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="t-acc py-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 type-label text-text [&::-webkit-details-marker]:hidden">
        <DisclosureChevron />
        {label}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-4">
      <p className="mb-2 type-label text-text">{label}</p>
      {children}
    </div>
  )
}

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '–')
const duration = (seconds: number | null) => (seconds === null ? '–' : `${seconds.toFixed(1)}s`)

/** How well articles are grouped into stories. Computed on the server every 5 minutes. */
const FEEDS_SHOWN = 5

/** Feeds, failing ones first so a broken feed is never hidden behind "Show all". */
function FeedsSection({ feeds }: { feeds: OpsStatus['feeds'] }) {
  const [expanded, setExpanded] = useState(false)
  const sorted = [...feeds].sort(
    (a, b) => Number(b.lastStatus === 'error') - Number(a.lastStatus === 'error'),
  )
  const shown = expanded ? sorted : sorted.slice(0, FEEDS_SHOWN)
  const errors = feeds.filter((f) => f.lastStatus === 'error').length
  return (
    <section aria-labelledby="feeds-heading">
      <SectionLabel id="feeds-heading">Feeds</SectionLabel>
      <p className="mb-2 type-meta" aria-live="polite">
        {plural(feeds.length, 'feed')}
        {errors ? ` · ${errors} failing` : ' · all polling fine'}
      </p>
      <Table head={['Publisher', 'Status', 'Last polled', 'Articles']}>
        {shown.map((f) => (
          <tr key={f.id}>
            <Td>
              <span className="font-medium">{f.publisherName}</span>
              <span className="block max-w-48 truncate type-meta sm:max-w-xs">{f.url}</span>
            </Td>
            <Td>
              {f.lastStatus === 'error' ? (
                <Tooltip content={f.lastError ?? 'No error message'}>
                  <span>
                    <Badge tone="error">error</Badge>
                  </span>
                </Tooltip>
              ) : (
                <Badge tone={f.lastStatus === 'ok' ? 'success' : 'neutral'}>
                  {f.lastStatus ?? 'never'}
                </Badge>
              )}
            </Td>
            <Td>{f.lastPolledAt ? relativeTime(f.lastPolledAt) : '–'}</Td>
            <Td>{f.articleCount}</Td>
          </tr>
        ))}
      </Table>
      {feeds.length > FEEDS_SHOWN ? (
        <Button
          size="sm"
          className="mt-4"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'Show fewer feeds' : `Show all ${feeds.length} feeds`}
        </Button>
      ) : null}
    </section>
  )
}

/** Feed polling failures, kept separately from model-job failures because they retry on the next poll. */
function FeedErrorsSection({ feeds }: { feeds: OpsStatus['feeds'] }) {
  const failures = feeds.filter((feed) => feed.lastStatus === 'error')
  if (failures.length === 0) return null
  return (
    <section id="feed-errors" aria-labelledby="feed-errors-heading" className="mt-10 scroll-mt-24">
      <SectionLabel id="feed-errors-heading">Feed errors</SectionLabel>
      <p className="mb-4 text-sm text-text-secondary">
        {plural(failures.length, 'feed')} could not be polled. Each will retry on its next scheduled
        poll.
      </p>
      <ul className="flex flex-col divide-y divide-border border-y border-border">
        {failures.map((feed) => (
          <li key={feed.id}>
            <details className="t-acc group">
              <summary className="flex cursor-pointer list-none gap-3 py-3 text-sm [&::-webkit-details-marker]:hidden">
                <span className="flex h-5 items-center">
                  <DisclosureChevron className="text-text-muted" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-semibold">{feed.publisherName}</span>
                    <span className="type-meta">
                      {feed.lastPolledAt
                        ? `failed ${relativeTime(feed.lastPolledAt)}`
                        : 'not polled'}
                    </span>
                  </span>
                  <span className="block truncate text-error">
                    {feed.lastError ?? 'No error message'}
                  </span>
                  <span className="block truncate text-text-secondary">{feed.url}</span>
                </span>
              </summary>
              <div className="mb-5 ml-7 border-l-2 border-border-strong pl-5">
                <Detail label="Error">
                  <pre className="bg-error-subtle p-3 text-xs whitespace-pre-wrap break-words text-error">
                    {feed.lastError ?? 'No error message'}
                  </pre>
                </Detail>
                <Detail label="Feed URL">
                  <a
                    href={feed.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-sm underline underline-offset-4"
                  >
                    {feed.url}
                  </a>
                </Detail>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  )
}

function MatchHealthSection() {
  const health = useQuery(queries.matchHealth())
  return (
    <section aria-labelledby="match-heading">
      <SectionLabel id="match-heading">Match health</SectionLabel>
      {health.isPending ? (
        <MatchHealthSkeleton />
      ) : health.isError ? (
        <Notice tone="error" title="Match health unavailable">
          {health.error.message}
        </Notice>
      ) : (
        <MatchHealthBody h={health.data} />
      )}
    </section>
  )
}

function MatchHealthSkeleton() {
  return (
    <div className="mt-4" aria-busy="true">
      <span className="sr-only">Loading match health…</span>
      <Skeleton className="h-4 w-full max-w-reading" />
      <Skeleton className="mt-2 h-4 w-3/4 max-w-reading" />
      <dl className="mt-4 grid grid-cols-2 border-t-2 border-rule sm:grid-cols-4">
        {['singletons', 'placements', 'model', 'merges'].map((key) => (
          <div key={key} className="border-b border-border py-4 pr-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-12" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </dl>
      <Skeleton className="mt-6 h-24 w-full" />
    </div>
  )
}

function FailedJobsSkeleton() {
  return (
    <div className="border-y border-border" aria-busy="true">
      <span className="sr-only">Loading failed jobs…</span>
      {[1, 2, 3].map((row) => (
        <div key={row} className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  )
}

function MatchHealthBody({ h }: { h: MatchHealth }) {
  const { recent, previous } = h.stories
  const placed = h.placements.newStory + h.placements.embedding + h.placements.model
  return (
    <>
      <p className="mb-4 max-w-reading text-sm text-text-secondary">
        Last 7 days. A falling share of one-article stories and few near-identical articles in
        different stories mean matching groups well. Some close pairs are rightly separate (a second
        attack, a roundup), so read the list before acting on the count. Updated{' '}
        {relativeTime(h.computedAt)}.
      </p>
      <dl className="grid grid-cols-2 border-t-2 border-rule sm:grid-cols-4">
        <StatText
          label="One-article stories"
          value={pct(recent.singletons, recent.total)}
          note={`${recent.singletons} of ${recent.total} stories${
            previous.total ? ` · ${pct(previous.singletons, previous.total)} the week before` : ''
          }`}
        />
        <StatText
          label="Articles placed"
          value={String(placed)}
          note={`${h.placements.newStory} new stories · ${h.placements.model} by the model · ${h.placements.embedding} by similarity`}
        />
        <StatText
          label="Model match calls"
          value={String(h.model.calls)}
          note={`${h.model.pickedStory} chose a story · ${h.model.pickedNone} none${h.model.failed ? ` · ${h.model.failed} failed` : ''}`}
        />
        <StatText
          label="Possible missed merges"
          value={String(h.splitPairs.count)}
          note={`article pairs ≥ ${h.splitPairs.threshold.toFixed(2)} similar in the latest ${h.splitPairs.sampleLimit} reports`}
        />
      </dl>
      <ClosestPairs pairs={h.splitPairs.worst} />
    </>
  )
}

const PAIRS_SHOWN = 5

/** The closest pairs of articles that sit in different stories: top 5, the rest on request. */
function ClosestPairs({ pairs }: { pairs: MatchHealth['splitPairs']['worst'] }) {
  const [expanded, setExpanded] = useState(false)
  if (pairs.length === 0) return null
  const shown = expanded ? pairs : pairs.slice(0, PAIRS_SHOWN)
  return (
    <div className="mt-6">
      <h3 className="mb-2 type-label text-text">Closest pairs in different stories</h3>
      <Table head={['Similarity', 'Article', 'Article']}>
        {shown.map((p) => (
          <tr key={`${p.a.title}|${p.b.title}`}>
            <Td>{p.similarity.toFixed(3)}</Td>
            <Td>
              <PairSide side={p.a} />
            </Td>
            <Td>
              <PairSide side={p.b} />
            </Td>
          </tr>
        ))}
      </Table>
      {pairs.length > PAIRS_SHOWN ? (
        <Button
          size="sm"
          className="mt-4"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'Show fewer pairs' : `Show ${pairs.length - PAIRS_SHOWN} more pairs`}
        </Button>
      ) : null}
    </div>
  )
}

function PairSide({ side }: { side: MatchHealth['splitPairs']['worst'][number]['a'] }) {
  return (
    <span className="block max-w-sm">
      <span className="block font-medium">{side.title}</span>
      <span className="block type-meta">
        {side.publisher} · in{' '}
        {side.storySlug ? (
          <Link
            to="/stories/$slug"
            params={{ slug: side.storySlug }}
            className="underline underline-offset-4"
          >
            {side.storyTitle}
          </Link>
        ) : (
          <>“{side.storyTitle}” (unpublished)</>
        )}
      </span>
    </span>
  )
}

function StatText({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-b border-border py-4 pr-4">
      <dt className="type-label text-text-muted">{label}</dt>
      <dd className="mt-1 type-numeral">{value}</dd>
      {note ? <dd className="mt-1 type-meta">{note}</dd> : null}
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="border-b border-border py-4 pr-4">
      <dt className="type-label text-text-muted">{label}</dt>
      <dd className="mt-1 type-numeral">
        <Digits value={value} />
      </dd>
      {note ? <dd className="mt-1 type-meta">{note}</dd> : null}
    </div>
  )
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b-2 border-rule text-left type-label">
            {head.map((h) => (
              <th key={h} scope="col" className="py-2 pr-4">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  )
}

function Td({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <td className={`py-2 pr-4 align-top ${mono ? 'text-xs font-semibold' : ''}`}>{children}</td>
  )
}

/**
 * A number whose changed digits pop in on each 5s refresh. Digits are keyed by place
 * (counted from the right) and value, so only the digits that changed re-mount and animate.
 */
function Digits({ value }: { value: number }) {
  const text = String(value)
  return (
    <span className="inline-flex">
      {[...text].map((digit, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the place is the identity here
        <span key={`${text.length - i}:${digit}`} className="t-pop">
          {digit}
        </span>
      ))}
    </span>
  )
}
