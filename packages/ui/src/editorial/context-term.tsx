import type { StoryContextItem } from '@dn/schemas'
import type { ReactNode } from 'react'
import { Popover } from '../primitives/overlay.tsx'

// "Background" is the default and goes unlabelled.
const KIND_LABEL: Record<Exclude<StoryContextItem['kind'], 'background'>, string> = {
  definition: 'Definition',
  prerequisite: 'Earlier development',
}

/** Inline term that opens a background explanation. Click, tap or keyboard; never hover-only. */
export function ContextTerm({ item, children }: { item: StoryContextItem; children: ReactNode }) {
  return (
    <Popover
      title={item.title}
      // A span, not a button: a button never wraps, so a long term would jump to its own line.
      nativeButton={false}
      trigger={
        <span
          data-context-term
          className="cursor-pointer text-inherit underline decoration-current/50 decoration-dotted decoration-2 underline-offset-4 hover:decoration-accent hover:decoration-solid"
        >
          {children}
        </span>
      }
    >
      <ContextExplanation item={item} />
    </Popover>
  )
}

export function ContextExplanation({ item }: { item: StoryContextItem }) {
  return (
    <div className="flex flex-col gap-2">
      {item.kind !== 'background' ? (
        <p className="text-2xs uppercase tracking-label text-text-muted">{KIND_LABEL[item.kind]}</p>
      ) : null}
      <p>{item.explanation}</p>
      {item.sources.length > 0 ? (
        <p className="text-xs text-text-muted">
          Based on{' '}
          {item.sources.map((s, i) => (
            <span key={s.articleId}>
              {i > 0 ? ', ' : ''}
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-text"
              >
                {s.publisherName}
              </a>
            </span>
          ))}
          .
        </p>
      ) : null}
    </div>
  )
}

/**
 * Split text into plain runs and context anchors (first occurrence of each, no overlaps).
 * Pure so it can be unit-tested.
 */
export function annotateText(text: string, items: StoryContextItem[]) {
  const hits = items
    .map((item) => ({ item, at: text.indexOf(item.anchorText) }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => a.at - b.at)
  const parts: ({ text: string } | { text: string; item: StoryContextItem })[] = []
  let cursor = 0
  for (const { item, at } of hits) {
    if (at < cursor) continue // overlaps a previous anchor
    if (at > cursor) parts.push({ text: text.slice(cursor, at) })
    parts.push({ text: item.anchorText, item })
    cursor = at + item.anchorText.length
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) })
  return parts
}
