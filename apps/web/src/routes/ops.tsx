import { relativeTime } from '@dn/domain'
import type { OpsAction } from '@dn/schemas'
import { Badge, Button, Card, ConfirmDialog, Notice, Skeleton } from '@dn/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Page, PageTitle, SectionLabel } from '../components/page.tsx'
import { api, queries } from '../lib/api.ts'

export const Route = createFileRoute('/ops')({
  // UI guard only; the /api/v1/ops endpoints enforce admin themselves.
  beforeLoad: ({ context }) => {
    if (!context.session.user?.isAdmin) throw redirect({ to: '/' })
  },
  head: () => ({ meta: [{ title: 'Pipeline · Domino News' }] }),
  component: OpsPage,
})

// Internal diagnostics. Polls every 5s; not a production admin console.
function OpsPage() {
  const status = useQuery(queries.ops())
  const queryClient = useQueryClient()
  const action = useMutation({
    mutationFn: (a: OpsAction['action']) => api.runOpsAction(a),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queries.ops().queryKey }),
  })
  const running = (a: OpsAction['action']) => action.isPending && action.variables === a

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
            onClick={() => action.mutate('poll_all_feeds')}
            loading={running('poll_all_feeds')}
          >
            Poll feeds now
          </Button>
          {s.backfillPaused ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => action.mutate('resume_backfill')}
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
              onConfirm={() => action.mutate('pause_backfill')}
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
            onConfirm={() => action.mutate('rebuild_search')}
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
                <Td num>{q.queued}</Td>
                <Td num>{q.active}</Td>
                <Td num>{q.failed > 0 ? <span className="text-error">{q.failed}</span> : 0}</Td>
                <Td num>{q.oldestQueuedAgeSeconds ? `${q.oldestQueuedAgeSeconds}s` : '–'}</Td>
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
                  <span title={f.lastError ?? ''}>
                    <Badge tone="error">error</Badge>
                  </span>
                ) : (
                  <Badge tone={f.lastStatus === 'ok' ? 'success' : 'neutral'}>
                    {f.lastStatus ?? 'never'}
                  </Badge>
                )}
              </Td>
              <Td>{f.lastPolledAt ? relativeTime(f.lastPolledAt) : '–'}</Td>
              <Td num>{f.articleCount}</Td>
            </tr>
          ))}
        </Table>
      </section>

      {s.recentFailures.length > 0 ? (
        <section className="mt-10">
          <SectionLabel>Failed jobs</SectionLabel>
          <ul className="flex flex-col gap-3">
            {s.recentFailures.map((f) => (
              <li key={f.id}>
                <Card tone="sunken" padded={false} className="p-3">
                  <p className="type-label">
                    {f.queue} · {f.failedAt ? relativeTime(f.failedAt) : ''}
                  </p>
                  <p className="mt-1 text-xs break-all text-text-secondary">{f.error}</p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Page>
  )
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="border-b border-border py-4 pr-4">
      <dt className="type-label text-text-muted">{label}</dt>
      <dd className="mt-1 type-numeral tabular-nums">{value}</dd>
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

function Td({ children, mono, num }: { children: ReactNode; mono?: boolean; num?: boolean }) {
  return (
    <td
      className={`py-2 pr-4 align-top ${mono ? 'text-xs font-semibold' : ''} ${num ? 'tabular-nums' : ''}`}
    >
      {children}
    </td>
  )
}
