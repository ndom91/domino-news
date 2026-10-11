import { formatDate } from '@dn/domain'
import {
  EVIDENCE_ATTRIBUTION,
  EVIDENCE_SOURCE_LABELS,
  FUNDING_LABELS,
  type FundingModel,
  LEAN_LABELS,
  type PublisherAssessment,
  publisherLeanSchema,
  RELIABILITY_LABELS,
  type ReliabilityLevel,
} from '@dn/schemas'
import type { ReactNode } from 'react'
import { cx } from '../cx.ts'
import { PositionScale, StatusScale } from './scale.tsx'

const FUNDING_ICONS: Record<FundingModel, ReactNode> = {
  public_broadcaster: <path d="M12 13v8M8 21h8M5 9a7 7 0 0 1 14 0M8.5 10a3.5 3.5 0 0 1 7 0" />,
  state: <path d="M3 21h18M4 10h16L12 4zM6 10v8M10 10v8M14 10v8M18 10v8" />,
  commercial: <path d="M3 8h18v12H3zM8 8V5h8v3M3 13h18" />,
  nonprofit: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  other: <circle cx="12" cy="12" r="7" />,
}

const RELIABILITY_STEPS = [
  { key: 'reliable', label: RELIABILITY_LABELS.reliable, tone: 'success' },
  { key: 'no_consensus', label: RELIABILITY_LABELS.no_consensus, tone: 'warning' },
  { key: 'unreliable', label: RELIABILITY_LABELS.unreliable, tone: 'error' },
  { key: 'deprecated', label: RELIABILITY_LABELS.deprecated, tone: 'error' },
] as const satisfies readonly { key: ReliabilityLevel; label: string; tone: string }[]

const LEANS = publisherLeanSchema.options

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-t-6 border-text pt-3">
      <h3 className="type-label text-text-muted">{title}</h3>
      {children}
    </div>
  )
}

const external = 'underline underline-offset-4 hover:text-text'

/**
 * A reviewed publisher assessment: funding model, reliability (status scale) and political
 * lean (ink-only position, relative to the outlet's own country). Evidence is one click away.
 */
export function AssessmentScorecard({
  assessment: a,
  className,
}: {
  assessment: PublisherAssessment
  className?: string
}) {
  const leanIndex = a.lean ? LEANS.indexOf(a.lean) : null
  return (
    <div className={className}>
      <div className="grid gap-8 md:grid-cols-3">
        <Panel title="Funding">
          {a.fundingModel ? (
            <p className="flex items-center gap-2.5 text-md font-bold">
              <svg
                viewBox="0 0 24 24"
                className="size-7 flex-none"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
                aria-hidden
              >
                {FUNDING_ICONS[a.fundingModel]}
              </svg>
              {FUNDING_LABELS[a.fundingModel]}
            </p>
          ) : null}
          <p className="text-sm text-text-secondary">{a.ownership}</p>
        </Panel>

        <Panel title="Reliability">
          <StatusScale steps={RELIABILITY_STEPS} value={a.reliabilityLevel} />
          <p className="text-sm text-text-secondary">{a.reliability}</p>
        </Panel>

        <Panel title="Political lean">
          <PositionScale
            steps={LEANS.map((l) => LEAN_LABELS[l])}
            value={leanIndex}
            startLabel="Left"
            endLabel="Right"
          />
          {a.lean ? (
            <p className="text-sm text-text-secondary">
              Relative to {a.countryContext ? `${a.countryContext} ` : ''}media
              {a.leanEvidenceUrl ? (
                <>
                  {' · '}
                  <a
                    href={a.leanEvidenceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={external}
                  >
                    source
                  </a>
                </>
              ) : null}
              {a.leanNote ? <span className="block">{a.leanNote}</span> : null}
            </p>
          ) : (
            <p className="text-sm text-text-secondary">
              Only shown with a cited, country-relative source.
            </p>
          )}
        </Panel>
      </div>

      <details
        className={cx(
          'group mt-6 border-t border-border pt-3',
          a.evidence.length === 0 && 'hidden',
        )}
      >
        <summary className="cursor-pointer list-none type-label text-text-muted [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="mr-1.5 inline-block group-open:rotate-90">
            ›
          </span>
          Evidence ({a.evidence.length})
        </summary>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {a.evidence.map((e) => (
            <li key={`${e.source}-${e.value}`} className="flex flex-wrap items-baseline gap-x-2">
              <a
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-border-strong px-1.5 py-0.5 text-xs font-bold hover:bg-text/5"
              >
                {EVIDENCE_SOURCE_LABELS[e.source] ?? e.source}
              </a>
              <span className="text-text-secondary">{e.value}</span>
            </li>
          ))}
        </ul>
      </details>

      <p className="mt-4 type-meta">
        Reviewed {formatDate(a.reviewedAt)} · {a.methodologyVersion}. Ownership from Wikidata (CC0),
        reliability from Wikipedia's perennial sources list (CC BY-SA 4.0).
      </p>
      <EvidenceAttribution sources={a.evidence.map((e) => e.source)} className="mt-1" />
    </div>
  )
}

/** Licence notices for the evidence sources that need one (e.g. AllSides' CC BY-NC). */
export function EvidenceAttribution({
  sources,
  className,
}: {
  sources: string[]
  className?: string
}) {
  const notices = [...new Set(sources)].flatMap((s) => EVIDENCE_ATTRIBUTION[s] ?? [])
  if (notices.length === 0) return null
  return (
    <p className={cx('type-meta', className)}>
      {notices.map((n, i) => (
        <span key={n.url}>
          {i > 0 ? ' · ' : null}
          {n.text} (
          <a href={n.url} target="_blank" rel="noopener noreferrer" className={external}>
            licence
          </a>
          ).
        </span>
      ))}
    </p>
  )
}
