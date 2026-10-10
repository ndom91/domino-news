import type { StoryContextItem, Summary } from '@dn/schemas'
import { Popover } from '../primitives/overlay.tsx'
import { Badge } from '../primitives/surface.tsx'
import { annotateText, ContextTerm } from './context-term.tsx'
import { Timestamp } from './time.tsx'

/** AI summary with its provenance. Distinguishes what sources report from established fact. */
export function SummaryBlock({
  summary,
  sourceCount,
  context = [],
}: {
  summary: Summary
  sourceCount: number
  /** Background entries; the first occurrence of each anchor becomes a popover. */
  context?: StoryContextItem[]
}) {
  const paragraphs = summary.body.split(/\n{2,}/)
  // Each entry annotates only its first occurrence across the whole summary.
  let remaining = context
  const annotate = (text: string) => {
    const parts = annotateText(text, remaining)
    const used = new Set(parts.flatMap((p) => ('item' in p ? [p.item.id] : [])))
    remaining = remaining.filter((c) => !used.has(c.id))
    // Each entry is annotated at most once, so its id is a stable key.
    return parts.map((p) =>
      'item' in p ? (
        <ContextTerm key={p.item.id} item={p.item}>
          {p.text}
        </ContextTerm>
      ) : (
        p.text
      ),
    )
  }
  return (
    <section aria-labelledby="summary-heading" className="flex flex-col gap-4">
      <h2 id="summary-heading" className="sr-only">
        Summary
      </h2>
      <div className="flex flex-col gap-3 font-serif text-lg leading-reading text-text">
        {summary.format === 'bullets' ? (
          <ul className="list-disc pl-5">
            {summary.body
              .split('\n')
              .filter(Boolean)
              .map((line) => (
                <li key={line}>{annotate(line.replace(/^[-•]\s*/, ''))}</li>
              ))}
          </ul>
        ) : (
          paragraphs.map((p) => <p key={p}>{annotate(p)}</p>)
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-text-muted">
        {summary.origin === 'edited' ? <Badge tone="accent">Edited</Badge> : null}
        <span>
          {summary.origin === 'edited' ? 'Edited summary' : 'Generated summary'} from{' '}
          {summary.citedArticleIds.length} of {sourceCount}{' '}
          {sourceCount === 1 ? 'source' : 'sources'}
          {summary.modelId ? ` · ${summary.modelId}` : ''}
        </span>
        <Timestamp iso={summary.createdAt} />
        <Popover
          title="How this summary is made"
          trigger={
            <button
              type="button"
              className="rounded-sm text-xs text-accent underline decoration-dotted underline-offset-2 hover:decoration-solid"
            >
              About this summary
            </button>
          }
        >
          <p>
            A local language model writes it from the headlines and descriptions that publishers put
            in their feeds. It does not read or store full articles unless the publisher allows it.
          </p>
          <p className="mt-2">
            It describes what outlets <em>report</em>. Reported claims are not confirmed facts.
            Check the linked sources below. Edits create a new version; earlier versions are kept.
          </p>
        </Popover>
      </div>
    </section>
  )
}
