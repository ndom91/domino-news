import type { StoryClaim } from '@dn/schemas'
import { DefaultLink, type LinkLike } from './link.tsx'

const STANCE_LABEL: Record<StoryClaim['mentions'][number]['stance'], string> = {
  asserts: 'Reported by',
  quotes: 'Attributed by',
  discusses: 'Mentioned by',
  denies: 'Disputed by',
}
const STANCE_ORDER = ['asserts', 'quotes', 'discusses', 'denies'] as const

/** Who says what: each claim with the outlets that report, attribute, mention or dispute it. */
export function ClaimList({
  claims,
  Link = DefaultLink,
}: {
  claims: StoryClaim[]
  Link?: LinkLike
}) {
  return (
    <ol className="flex flex-col gap-5">
      {claims.map((claim) => (
        <li key={claim.id} className="border-t border-border pt-3">
          <p className="text-md font-semibold leading-snug text-text">{claim.proposition}</p>
          <dl className="mt-1.5 flex flex-col gap-0.5 text-label">
            {STANCE_ORDER.map((stance) => {
              const outlets = claim.mentions.filter((m) => m.stance === stance)
              if (outlets.length === 0) return null
              return (
                <div key={stance} className="flex flex-wrap gap-x-1.5">
                  <dt
                    className={stance === 'denies' ? 'font-bold text-text' : 'font-bold text-text'}
                  >
                    {STANCE_LABEL[stance]}
                  </dt>
                  <dd className="text-text-muted">
                    {outlets.map((m, i) => (
                      <span key={m.articleId}>
                        {i > 0 ? ', ' : ''}
                        <Link
                          to={`#source-${m.articleId}`}
                          className="hover:text-text hover:underline underline-offset-2"
                        >
                          {m.publisher.name}
                        </Link>
                      </span>
                    ))}
                  </dd>
                </div>
              )
            })}
            {claim.evidence.length > 0 ? (
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
                        {e.title ?? new URL(e.url).hostname} ↗
                      </a>
                      <span className="text-text-muted"> ({e.relationship})</span>
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
        </li>
      ))}
    </ol>
  )
}
