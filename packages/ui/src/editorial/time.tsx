import { clockTime, formatDateTime, shortRelative } from '@dn/domain'
import { useEffect, useState } from 'react'
import { cx } from '../cx.ts'
import { Tooltip } from '../primitives/overlay.tsx'

/**
 * `<time>` with the absolute UTC time in a tooltip. Relative text refreshes each minute on
 * the client (tabular figures, so it doesn't shift layout).
 */
export function Timestamp({
  at,
  format = 'relative',
  prefix,
  className,
}: {
  at: string
  format?: 'relative' | 'clock'
  prefix?: string
  className?: string
}) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    if (format !== 'relative') return
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [format])
  const text = format === 'clock' ? clockTime(at) : shortRelative(at, now ?? undefined)
  return (
    <Tooltip content={formatDateTime(at)}>
      <time dateTime={at} className={cx('tabular-nums', className)} suppressHydrationWarning>
        {prefix ? `${prefix} ` : null}
        {text}
      </time>
    </Tooltip>
  )
}
