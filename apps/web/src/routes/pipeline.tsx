import type { OpsAction } from '@dn/schemas'
import { Button, ConfirmDialog, Notice, Skeleton, Tabs } from '@dn/ui'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod/mini'
import { Page, PageTitle } from '../components/page.tsx'
import { FailedJobs, MatchHealthSection } from '../components/pipeline/health.tsx'
import { InferenceSection } from '../components/pipeline/inference.tsx'
import { OverviewSection } from '../components/pipeline/overview.tsx'
import { actionKey, useOpsAction } from '../components/pipeline/shared.tsx'
import { FeedErrorsSection, FeedsSection } from '../components/pipeline/sources.tsx'
import { queries } from '../lib/api.ts'

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
