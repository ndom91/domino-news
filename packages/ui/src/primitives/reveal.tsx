import { type CSSProperties, type ReactNode, useEffect, useState } from 'react'
import { cx } from '../cx.ts'

// Set after the first client render commits. Server-rendered content never animates (no fade on
// first paint); anything mounted later (client navigation, a finished query, "Show older
// stories") rises in with t-reveal.
let hydrated = false

// Reveals mounted in the same frame stagger by 40ms each, capped so long lists don't drag.
const MAX_STAGGER = 8
let batch = 0
let resetQueued = false
function nextInBatch() {
  if (!resetQueued) {
    resetQueued = true
    requestAnimationFrame(() => {
      batch = 0
      resetQueued = false
    })
  }
  return Math.min(batch++, MAX_STAGGER)
}

/** Class and style that make an element rise in when it mounts after hydration. */
export function useReveal(): { className?: string; style?: CSSProperties } {
  const [index] = useState(() => (hydrated ? nextInBatch() : null))
  useEffect(() => {
    hydrated = true
  }, [])
  if (index === null) return {}
  return { className: 't-reveal', style: { '--reveal-i': index } as CSSProperties }
}

/** Block that rises in when it mounts after hydration, e.g. results replacing a skeleton. */
export function Reveal({
  as: Tag = 'div',
  children,
  className,
}: {
  as?: 'div' | 'li'
  children: ReactNode
  className?: string
}) {
  const reveal = useReveal()
  return (
    <Tag className={cx(reveal.className, className)} style={reveal.style}>
      {children}
    </Tag>
  )
}
