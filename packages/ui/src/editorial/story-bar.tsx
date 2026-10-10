import type { Desk } from '@dn/schemas'
import { cx } from '../cx.ts'
import { deskKey } from './desk-key.ts'
import { DefaultLink, type LinkLike } from './link.tsx'
import { Timestamp } from './time.tsx'

/** Bar above a story in its desk's colour: its Narrative or desk, and when it was last reported. */
export function StoryBar({
  desk,
  label,
  href,
  timestamp,
  Link = DefaultLink,
  className,
}: {
  desk: Desk | null
  label: string
  href?: string
  timestamp: string
  Link?: LinkLike
  className?: string
}) {
  return (
    <div
      className={cx(
        deskKey(desk),
        'flex h-bar items-center justify-between gap-3 key-fill px-2.5 text-sm font-bold',
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
