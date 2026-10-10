import { cx } from '../cx.ts'
import { DefaultLink, type LinkLike } from './link.tsx'
import { narrativeKey } from './narrative-key.ts'
import { Timestamp } from './time.tsx'

/** Coloured bar above a story: its Narrative (or "Single story") and when it was last reported. */
export function StoryBar({
  slot,
  label,
  href,
  timestamp,
  Link = DefaultLink,
  className,
}: {
  slot: number
  label: string
  href?: string
  timestamp: string
  Link?: LinkLike
  className?: string
}) {
  return (
    <div
      className={cx(
        narrativeKey(slot),
        'flex h-bar items-center justify-between gap-3 bg-key px-2.5 text-sm font-bold text-key-text',
        className,
      )}
    >
      {href ? (
        <Link to={href} className="min-w-0 truncate hover:underline">
          {label}
        </Link>
      ) : (
        <span className="min-w-0 truncate">{label}</span>
      )}
      <Timestamp at={timestamp} className="flex-none font-semibold" />
    </div>
  )
}
