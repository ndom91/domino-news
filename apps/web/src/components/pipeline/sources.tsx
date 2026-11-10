import { plural, relativeTime } from '@dn/domain'
import type { OpsStatus } from '@dn/schemas'
import { Badge, Button, SectionLabel, Tooltip } from '@dn/ui'
import { useState } from 'react'
import { Detail, ErrorRow, Table, Td } from './shared.tsx'

const FEEDS_SHOWN = 5

/** Feeds, failing ones first so a broken feed is never hidden behind "Show all". */
export function FeedsSection({ feeds }: { feeds: OpsStatus['feeds'] }) {
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
export function FeedErrorsSection({ feeds }: { feeds: OpsStatus['feeds'] }) {
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
            <ErrorRow
              title={<span className="font-semibold">{feed.publisherName}</span>}
              meta={feed.lastPolledAt ? `failed ${relativeTime(feed.lastPolledAt)}` : 'not polled'}
              error={feed.lastError}
              subtitle={feed.url}
            >
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
            </ErrorRow>
          </li>
        ))}
      </ul>
    </section>
  )
}
