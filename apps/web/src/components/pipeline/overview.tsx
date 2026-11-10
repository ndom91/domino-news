import { plural, relativeTime } from '@dn/domain'
import type { OpsStatus } from '@dn/schemas'
import { Badge, SectionLabel } from '@dn/ui'
import { Link } from '@tanstack/react-router'
import { Digits, Stat, Table, Td } from './shared.tsx'

export function OverviewSection({
  pipeline,
  queues,
  recentRuns,
}: Pick<OpsStatus, 'pipeline' | 'queues' | 'recentRuns'>) {
  return (
    <>
      <dl className="grid grid-cols-2 border-t-2 border-rule sm:grid-cols-4">
        <Stat
          label="Articles"
          value={<Digits value={pipeline.articles} />}
          note={`${pipeline.articlesEmbedded} embedded · ${pipeline.articlesMatched} in stories`}
        />
        <Stat
          label="Stories"
          value={<Digits value={pipeline.stories} />}
          note={`${pipeline.storiesPublished} published`}
        />
        <Stat label="Narratives" value={<Digits value={pipeline.narratives} />} />
        <Stat
          label="Search outbox"
          value={<Digits value={pipeline.outboxPending} />}
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
