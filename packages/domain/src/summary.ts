import type { StoryContextItem } from '@dn/schemas'

/** Paragraph boundaries from the summary model, preserving citation and entity text runs. */
export function summaryParagraphs(
  summary: { body: string; detail?: string | null } | null,
  context: StoryContextItem[] = [],
) {
  if (!summary) return []
  let shown = ''
  return [summary.body, summary.detail ?? '']
    .flatMap((text) => text.split(/\n\s*\n/))
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => {
      const available = context.filter((item) => !shown.includes(item.anchorText))
      shown += `\n${text}`
      return { text, context: available }
    })
}
