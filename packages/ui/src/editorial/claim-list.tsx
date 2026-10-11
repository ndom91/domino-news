import { clockTime, formatDate, formatDateTime, hostnameOf } from '@dn/domain'
import type { StoryClaim } from '@dn/schemas'
import { Tooltip } from '../primitives/overlay.tsx'
import { DefaultLink, type LinkLike } from './link.tsx'

type Mention = StoryClaim['mentions'][number]

/** Each publisher once, in first-mention order. */
function publishers(mentions: Mention[]) {
  const seen = new Map<string, Mention>()
  for (const m of mentions) if (!seen.has(m.publisher.id)) seen.set(m.publisher.id, m)
  return [...seen.values()]
}

/**
 * Who says what: each claim with one meta line: when it was first reported, then the
 * publishers carrying it (truncated to fit). Disputes are called out; they change the meaning.
 */
export function ClaimList({
  claims,
  Link = DefaultLink,
}: {
  claims: StoryClaim[]
  Link?: LinkLike
}) {
  const names = (list: Mention[]) =>
    list.map((m, i) => (
      <span key={m.publisher.id}>
        {i > 0 ? ', ' : ''}
        <Link
          to={`#source-${m.articleId}`}
          className="hover:text-text hover:underline underline-offset-2"
        >
          {m.publisher.name}
        </Link>
      </span>
    ))
  return (
    <ol className="flex flex-col gap-5">
      {claims.map((claim) => {
        const carrying = publishers(claim.mentions.filter((m) => m.stance !== 'denies'))
        const disputing = publishers(claim.mentions.filter((m) => m.stance === 'denies'))
        return (
          <li key={claim.id} className="border-t border-border pt-3">
            <p className="text-md font-semibold leading-snug text-text">{claim.proposition}</p>
            <p className="mt-1.5 flex min-w-0 items-baseline gap-x-2 text-label text-text-muted">
              {claim.firstReportedAt ? (
                <>
                  <Tooltip content={`First reported ${formatDateTime(claim.firstReportedAt)}`}>
                    <time
                      dateTime={claim.firstReportedAt}
                      className="flex-none font-semibold text-text"
                    >
                      {formatDate(claim.firstReportedAt)}, {clockTime(claim.firstReportedAt)}
                    </time>
                  </Tooltip>
                  <span aria-hidden className="flex-none text-border-strong">
                    |
                  </span>
                </>
              ) : null}
              <Tooltip
                content={[...carrying, ...disputing].map((m) => m.publisher.name).join(', ')}
              >
                <span className="min-w-0 truncate">
                  {names(carrying)}
                  {disputing.length > 0 ? (
                    <span className="font-semibold text-error">
                      {carrying.length > 0 ? ' · ' : ''}Disputed by {names(disputing)}
                    </span>
                  ) : null}
                </span>
              </Tooltip>
            </p>
            {claim.evidence.length > 0 ? (
              <dl className="mt-0.5 text-label">
                <div className="flex flex-wrap gap-x-1.5">
                  <dt className="font-bold">Primary source</dt>
                  <dd>
                    {claim.evidence.map((e, i) => (
                      <span key={e.url}>
                        {i > 0 ? ', ' : ''}
                        <a
                          href={e.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-text underline decoration-accent decoration-2 underline-offset-3"
                        >
                          {e.title ?? hostnameOf(e.url) ?? e.url} ↗
                        </a>
                        <span className="text-text-muted"> ({e.relationship})</span>
                      </span>
                    ))}
                  </dd>
                </div>
              </dl>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
