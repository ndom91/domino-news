// Building blocks shared by the Pipeline page's tabs.

import type { OpsAction } from '@dn/schemas'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { api } from '../../lib/api.ts'
import { DisclosureChevron } from '../disclosure-chevron.tsx'

/** Runs an ops action and refreshes the status and failed-jobs views. */
export function useOpsAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: OpsAction) => api.runOpsAction(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ops'] }),
  })
}

// Same key for one job's buttons, so only the pressed one shows pending.
export const actionKey = (a: OpsAction) =>
  'queue' in a ? `${a.action}:${a.queue}:${a.ids?.join(',') ?? 'all'}` : a.action

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="border-b border-border py-4 pr-4">
      <dt className="type-label text-text-muted">{label}</dt>
      <dd className="mt-1 type-numeral">{value}</dd>
      {note ? <dd className="mt-1 type-meta">{note}</dd> : null}
    </div>
  )
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
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

export function Td({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return (
    <td className={`py-2 pr-4 align-top ${mono ? 'text-xs font-semibold' : ''}`}>{children}</td>
  )
}

export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-4">
      <p className="mb-2 type-label text-text">{label}</p>
      {children}
    </div>
  )
}

/**
 * A failure that folds open: title, meta, the error and a subtitle on the summary line, then
 * any actions, the full error and further details. Failed jobs and feed errors share it.
 */
export function ErrorRow({
  title,
  meta,
  error,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode
  meta: ReactNode
  error: string | null
  subtitle?: ReactNode
  /** Buttons above the full error. */
  actions?: ReactNode
  children?: ReactNode
}) {
  const message = error ?? 'No error message'
  return (
    <details className="t-acc group">
      <summary className="flex cursor-pointer list-none gap-3 py-3 text-sm [&::-webkit-details-marker]:hidden">
        {/* A first-line-high box keeps the icon level with the title. */}
        <span className="flex h-5 items-center">
          <DisclosureChevron className="text-text-muted" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-3">
            {title}
            <span className="type-meta">{meta}</span>
          </span>
          <span className="mt-0.5 block truncate text-error">{message}</span>
          {subtitle ? <span className="block truncate text-text-secondary">{subtitle}</span> : null}
        </span>
      </summary>
      {/* Indented under the summary text, with a rule so the panel reads as one failure. */}
      <div className="mb-5 ml-7 flex flex-col divide-y divide-border border-l-2 border-border-strong pl-5">
        {actions ? <div className="flex flex-wrap gap-2 pb-4">{actions}</div> : null}
        <Detail label="Error">
          <pre className="bg-error-subtle p-3 text-xs whitespace-pre-wrap break-words text-error">
            {message}
          </pre>
        </Detail>
        {children}
      </div>
    </details>
  )
}

/**
 * A number whose changed digits pop in on each 30 s refresh. Digits are keyed by place
 * (counted from the right) and value, so only the digits that changed re-mount and animate.
 */
export function Digits({ value }: { value: number }) {
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
