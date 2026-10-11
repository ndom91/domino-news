import { logoUrl } from '@dn/domain'
import { useEffect, useRef, useState } from 'react'
import { cx } from '../cx.ts'

/**
 * A publisher's logo on a light tile, so dark marks stay visible on the dark theme.
 * Decorative: the publisher's name always sits next to it. Renders nothing when the
 * publisher has no logo.
 */
export function PublisherLogo({
  slug,
  size,
  className,
}: {
  slug: string
  /** Tile edge in px. */
  size: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLImageElement>(null)

  // A 404 that lands before hydration fires no onError React can see; check on mount.
  useEffect(() => {
    const img = ref.current
    if (img?.complete && img.naturalWidth === 0) setFailed(true)
  }, [])

  if (failed) return null
  return (
    <span
      aria-hidden
      className={cx(
        'block flex-none border border-border bg-band-text',
        className,
      )}
      // Padding in px: a percentage would resolve against the parent's width, not the tile's.
      style={{ width: size, height: size, padding: Math.round(size * 0.12) }}
    >
      <img
        ref={ref}
        src={logoUrl(slug)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="block size-full object-contain"
      />
    </span>
  )
}
