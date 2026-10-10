import type { Desk } from '@dn/schemas'
import { cx } from '../cx.ts'
import { deskKey, deskLabel } from './desk-key.ts'
import { DefaultLink, type LinkLike } from './link.tsx'
import { Timestamp } from './time.tsx'

/**
 * Bar above a story in its desk's colour: the desk, then its Narrative (if any) as a link,
 * and when it was last reported. The colour always matches the desk name, never the Narrative.
 */
export function StoryBar({
  desk,
  narrative,
  timestamp,
  Link = DefaultLink,
  className,
}: {
  desk: Desk | null
  narrative?: { title: string; href: string }
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
      <span className="flex min-w-0 gap-1.5">
        <span className="flex-none">{deskLabel(desk)}</span>
        {narrative ? (
          <>
            <span aria-hidden className="flex-none">
              ·
            </span>
            <Link to={narrative.href} className="min-w-0 truncate font-semibold hover:underline">
              {narrative.title}
            </Link>
          </>
        ) : null}
      </span>
      <Timestamp at={timestamp} className="flex-none font-semibold" />
    </div>
  )
}
