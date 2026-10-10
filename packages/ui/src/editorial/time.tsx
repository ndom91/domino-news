import { clockTime, formatDateTime, shortRelative } from '@dn/domain'
import { useEffect, useState } from 'react'
import { cx } from '../cx.ts'

/**
 * `<time>` with the absolute UTC time in the title. Relative text refreshes each minute on
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
    <time
      dateTime={at}
      title={formatDateTime(at)}
      className={cx('tabular-nums', className)}
      suppressHydrationWarning
    >
      {prefix ? `${prefix} ` : null}
      {text}
    </time>
  )
}
