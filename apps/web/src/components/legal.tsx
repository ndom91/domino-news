import { fullDate } from '@dn/domain'
import type { ReactNode } from 'react'
import { LEGAL_UPDATED_AT } from '../lib/operator.ts'
import { Page } from './page.tsx'

/** Shared layout for About and the legal pages: one h1, a reading column, last-updated date. */
export function LegalPage({
  title,
  lead,
  children,
}: {
  title: string
  lead?: ReactNode
  children: ReactNode
}) {
  return (
    <Page>
      <article className="max-w-reading pb-8">
        <h1 className="border-b-6 border-rule pb-3.5 type-section">{title}</h1>
        <p className="mt-3 type-meta">Last updated {fullDate(`${LEGAL_UPDATED_AT}T00:00:00Z`)}</p>
        {lead ? (
          <div className="mt-8 text-md leading-relaxed text-text-secondary">{lead}</div>
        ) : null}
        <div className="mt-10 flex flex-col gap-10">{children}</div>
      </article>
    </Page>
  )
}

/** A titled section with an anchor (e.g. /privacy#rights). */
export function Section({
  id,
  title,
  children,
}: {
  id: string
  title: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24 target:bg-sunken">
      <h2 id={`${id}-heading`} className="mb-3 border-t-2 border-rule pt-3 type-label">
        {title}
      </h2>
      <div className="flex flex-col gap-3 leading-relaxed [&_a]:underline [&_a]:underline-offset-4 [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </section>
  )
}

/** The operator's email as a mailto link. */
export function Email({ address }: { address: string }) {
  return <a href={`mailto:${address}`}>{address}</a>
}
