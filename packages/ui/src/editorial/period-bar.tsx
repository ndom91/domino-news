import type { ReactNode } from 'react'
import { cx } from '../cx.ts'
import { positionKey } from './desk-key.ts'

/**
 * Section heading in the story-bar style (a solid key-colour band). Coloured by position,
 * not desk, so neighbouring sections differ and the colour carries no meaning.
 */
export function PeriodBar({
  title,
  meta,
  position,
  id,
  className,
}: {
  title: ReactNode
  meta?: ReactNode
  position: number
  id?: string
  className?: string
}) {
  return (
    <div
      className={cx(
        positionKey(position),
        'flex h-bar items-center justify-between gap-3 key-fill px-2.5 text-sm font-bold',
        className,
      )}
    >
      <h2 id={id} className="min-w-0 truncate">
        {title}
      </h2>
      {meta ? <span className="flex-none font-semibold">{meta}</span> : null}
    </div>
  )
}
