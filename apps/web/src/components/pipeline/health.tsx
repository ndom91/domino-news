import { plural, relativeTime } from '@dn/domain'
import {
  FAILED_JOB_RETENTION_DAYS,
  type FailedJob,
  type MatchHealth,
  type OpsAction,
} from '@dn/schemas'
import { Badge, Button, ConfirmDialog, Notice, SectionLabel, Skeleton } from '@dn/ui'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useState } from 'react'
import { queries } from '../../lib/api.ts'
import { DisclosureChevron } from '../disclosure-chevron.tsx'
import { actionKey, Detail, ErrorRow, Stat, Table, Td, useOpsAction } from './shared.tsx'

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '–')

export function MatchHealthSection() {
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
        <Stat
          label="One-article stories"
          value={pct(recent.singletons, recent.total)}
          note={`${recent.singletons} of ${recent.total} stories${
            previous.total ? ` · ${pct(previous.singletons, previous.total)} the week before` : ''
          }`}
        />
        <Stat
          label="Articles placed"
          value={placed}
          note={`${h.placements.newStory} new stories · ${h.placements.model} by the model · ${h.placements.embedding} by similarity`}
        />
        <Stat
          label="Model match calls"
          value={h.model.calls}
          note={`${h.model.pickedStory} chose a story · ${h.model.pickedNone} none${h.model.failed ? ` · ${h.model.failed} failed` : ''}`}
        />
        <Stat
          label="Possible missed merges"
          value={h.splitPairs.count}
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

export function FailedJobs({ queue }: { queue: string | null }) {
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
    <ErrorRow
      title={<span className="text-xs font-semibold">{job.queue}</span>}
      meta={
        <>
          {job.failedAt ? `failed ${relativeTime(job.failedAt)}` : 'failed'} · {job.attempts} of{' '}
          {job.maxAttempts} attempts
        </>
      }
      error={job.error}
      subtitle={job.target?.title}
      actions={
        <>
          <Button size="sm" loading={retrying} onClick={onRetry}>
            Retry job
          </Button>
          <Button size="sm" variant="danger" loading={dismissing} onClick={onDismiss}>
            Dismiss job
          </Button>
        </>
      }
    >
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
                  <span className="break-words text-xs text-text-secondary">{r.error ?? '–'}</span>
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
    </ErrorRow>
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
