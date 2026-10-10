import { splitCitations } from '@dn/domain'
import type { StoryContextItem } from '@dn/schemas'
import { Fragment } from 'react'
import { cx } from '../cx.ts'
import { annotateText, ContextTerm } from './context-term.tsx'

export interface CitedSource {
  outlet: string
  /** Where the marker leads: the source row on the page, or the original article. */
  href: string
}

/** Superscript `[n]` linking to a source. Orange text on canvas; inherits colour on a coloured hero. */
export function CitationMarker({
  n,
  source,
  inherit = false,
}: {
  n: number
  source?: CitedSource
  inherit?: boolean
}) {
  const className = cx(
    'px-px align-[0.5em] text-[0.62em] font-extrabold hover:underline',
    inherit ? 'text-inherit' : 'text-accent-text',
  )
  if (!source) return <span className={className}>[{n}]</span>
  return (
    <a href={source.href} title={`Source ${n}: ${source.outlet}`} className={className}>
      [{n}]
    </a>
  )
}

/**
 * Summary text with `[n]` citation markers and, optionally, context popovers on the first
 * occurrence of each anchor.
 */
export function SummaryText({
  text,
  sources,
  context = [],
  inherit = false,
}: {
  text: string
  sources: Map<number, CitedSource>
  context?: StoryContextItem[]
  inherit?: boolean
}) {
  let remaining = context
  return (
    <>
      {splitCitations(text).map((part, i) => {
        if ('citation' in part) {
          return (
            <CitationMarker
              // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reorder
              key={i}
              n={part.citation}
              source={sources.get(part.citation)}
              inherit={inherit}
            />
          )
        }
        const annotated = annotateText(part.text, remaining)
        const used = new Set(annotated.flatMap((p) => ('item' in p ? [p.item.id] : [])))
        remaining = remaining.filter((c) => !used.has(c.id))
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reorder
          <Fragment key={i}>
            {annotated.map((p) =>
              'item' in p ? (
                <ContextTerm key={p.item.id} item={p.item}>
                  {p.text}
                </ContextTerm>
              ) : (
                p.text
              ),
            )}
          </Fragment>
        )
      })}
    </>
  )
}
