import { type RefObject, useEffect, useState } from 'react'

/** Element width in whole pixels, tracked on resize. Null until mounted (and on the server). */
export function useWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Measure now, not only on the observer's first callback (a frame later).
    setWidth(Math.floor(el.clientWidth))
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return width
}
