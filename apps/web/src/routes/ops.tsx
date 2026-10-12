import { plural, relativeTime } from '@dn/domain'
import { FAILED_JOB_RETENTION_DAYS, type FailedJob, type OpsAction } from '@dn/schemas'
import { Badge, Button, ConfirmDialog, Notice, SectionLabel, Skeleton, Tooltip } from '@dn/ui'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { z } from 'zod/mini'
import { Page, PageTitle } from '../components/page.tsx'
import { api, queries } from '../lib/api.ts'

export const Route = createFileRoute('/ops')({
  // UI guard only; the /api/v1/ops endpoints enforce admin themselves.
  beforeLoad: ({ context }) => {
    if (!context.session.user?.isAdmin) throw redirect({ to: '/' })
  },
  // ?failed=<queue> filters the Failed jobs section to one queue.
  validateSearch: z.object({ failed: z.catch(z.optional(z.string()), undefined) }),
  head: () => ({ meta: [{ title: 'Pipeline · Domino News' }] }),
  component: OpsPage,
})

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

// Internal diagnostics. Polls every 5s; not a production admin console.
function OpsPage() {
  const status = useQuery(queries.ops())
  const { failed } = Route.useSearch()
  const action = useOpsAction()
  const running = (a: OpsAction['action']) =>
    action.isPending && action.variables && actionKey(action.variables) === a

  if (status.isPending) {
    return (
      <Page>
        <Skeleton className="h-40 w-full" />
      </Page>
    )
  }
  if (status.isError) {
    return (
      <Page>
        <Notice tone="error" title="Pipeline status unavailable">
          {status.error.message}
        </Notice>
      </Page>
    )
  }
  const s = status.data
  const p = s.pipeline

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

      <dl className="mt-8 grid grid-cols-2 border-t-2 border-rule sm:grid-cols-4">
        <Stat
          label="Articles"
          value={p.articles}
          note={`${p.articlesEmbedded} embedded · ${p.articlesMatched} in stories`}
        />
        <Stat label="Stories" value={p.stories} note={`${p.storiesPublished} published`} />
        <Stat label="Narratives" value={p.narratives} />
        <Stat
          label="Search outbox"
          value={p.outboxPending}
          note={`${p.outboxFailed} dead · oldest ${p.oldestOutboxAgeSeconds ?? 0}s`}
        />
      </dl>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section className="min-w-0">
          <SectionLabel>Queues</SectionLabel>
          <Table head={['Queue', 'Queued', 'Active', 'Failed', 'Oldest']}>
            {s.queues.map((q) => (
              <tr key={q.name}>
                <Td mono>{q.name}</Td>
                <Td>{q.queued}</Td>
                <Td>{q.active}</Td>
                <Td>
                  {q.failed > 0 ? (
                    <Link
                      to="/ops"
                      search={{ failed: q.name }}
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
        <section className="min-w-0">
          <SectionLabel>Recent analysis runs</SectionLabel>
          <Table head={['Operation', 'Model', 'Status', 'Started']}>
            {s.recentRuns.map((r) => (
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

      <section className="mt-10">
        <SectionLabel>Feeds</SectionLabel>
        <Table head={['Publisher', 'Status', 'Last polled', 'Articles']}>
          {s.feeds.map((f) => (
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
      </section>

      <FailedJobs queue={failed ?? null} />
    </Page>
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
                to="/ops"
                search={{}}
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
        <Skeleton className="h-24 w-full" />
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
      <summary className="grid cursor-pointer list-none grid-cols-[auto_1fr] gap-x-3 gap-y-1 py-3 text-sm [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="t-acc-chevron text-text-muted">
          ›
        </span>
        <span className="min-w-0">
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
      <div className="flex flex-col gap-4 pb-5 pl-6">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" loading={retrying} onClick={onRetry}>
            Retry job
          </Button>
          <Button size="sm" variant="danger" loading={dismissing} onClick={onDismiss}>
            Dismiss job
          </Button>
        </div>
        <Detail label="Error">
          <pre className="text-xs whitespace-pre-wrap break-words text-error">
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
          <Detail label="Recent attempts">
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
                  <Td mono>{r.promptVersion}</Td>
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
          <Detail label="Stack">
            <pre className="max-h-64 overflow-auto bg-sunken p-3 text-xs">{job.stack}</pre>
          </Detail>
        ) : null}
        <Detail label="Payload">
          <pre className="max-h-64 overflow-auto bg-sunken p-3 text-xs">
            {JSON.stringify(job.payload, null, 2)}
          </pre>
        </Detail>
        <p className="type-meta">
          Job {job.id} · queued {relativeTime(job.createdAt)}
        </p>
      </div>
    </details>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 type-label text-text-muted">{label}</p>
      {children}
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
