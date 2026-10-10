import type { StoryClaim } from '@dn/schemas'
import type { LinkLike } from './story-row.tsx'

const STANCE_LABEL: Record<StoryClaim['mentions'][number]['stance'], string> = {
  asserts: 'Reported by',
  quotes: 'Attributed by',
  discusses: 'Mentioned by',
  denies: 'Disputed by',
}
const STANCE_ORDER = ['asserts', 'quotes', 'discusses', 'denies'] as const

const DefaultLink: LinkLike = ({ to, className, children }) => (
  <a href={to} className={className}>
    {children}
  </a>
)

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
        <li key={claim.id} className="border-l-2 border-border-strong pl-4">
          <p className="font-serif text-md leading-snug text-text">{claim.proposition}</p>
          <dl className="mt-1.5 flex flex-col gap-0.5 text-sm">
            {STANCE_ORDER.map((stance) => {
              const outlets = claim.mentions.filter((m) => m.stance === stance)
              if (outlets.length === 0) return null
              return (
                <div key={stance} className="flex flex-wrap gap-x-1.5">
                  <dt
                    className={stance === 'denies' ? 'font-medium text-warning' : 'text-text-muted'}
                  >
                    {STANCE_LABEL[stance]}
                  </dt>
                  <dd className="text-text-secondary">
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
                <dt className="text-text-muted">Primary source</dt>
                <dd>
                  {claim.evidence.map((e, i) => (
                    <span key={e.url}>
                      {i > 0 ? ', ' : ''}
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline"
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
