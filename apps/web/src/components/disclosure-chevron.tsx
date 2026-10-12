import { CaretRightIcon } from '@phosphor-icons/react'

/**
 * Chevron for a `<details className="t-acc">` summary; it turns when that disclosure opens.
 * The icon is drawn centred in its own box, so it rotates in place. A text "›" sits
 * off-centre in its glyph box and swings around as it turns.
 */
export function DisclosureChevron({
  size = 14,
  className,
}: {
  // Pixels, or a CSS length such as "0.7em" to follow a heading's text size.
  size?: number | string
  className?: string
}) {
  return (
    <CaretRightIcon
      aria-hidden
      size={size}
      weight="bold"
      className={`t-acc-chevron flex-none ${className ?? ''}`}
    />
  )
}
