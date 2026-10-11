import { clockTime, formatDate, formatDateTime, shortRelative, zoneName } from '@dn/domain'
import { useEffect, useState } from 'react'
import { Tooltip } from '../primitives/overlay.tsx'

const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * `<time>` for one moment, shown in UTC (or the reader's zone with `local`), with the full
 * date and time in the other zone in a tooltip. The server can't know the reader's zone, so
 * `local` text renders as UTC first and switches after mount. Relative text refreshes each
 * minute on the client.
 */
export function Timestamp({
  at,
  format = 'relative',
  local = false,
  prefix,
  firstAt,
  className,
}: {
  at: string
  format?: 'relative' | 'clock' | 'datetime'
  local?: boolean
  prefix?: string
  /** When set, the tooltip shows "First reported …" and "Updated …" (at) instead of one time. */
  firstAt?: string
  className?: string
}) {
  const [now, setNow] = useState<Date | null>(null)
  const [readerZone, setReaderZone] = useState<string | null>(null)
  useEffect(() => {
    setReaderZone(localZone())
    if (format !== 'relative') return
    setNow(new Date())
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [format])

  const zone = local && readerZone ? readerZone : 'UTC'
  const clock = () => `${clockTime(at, zone)} ${zoneName(at, zone)}`
  const text =
    format === 'relative'
      ? shortRelative(at, now ?? undefined)
      : format === 'clock'
        ? clock()
        : `${formatDate(at, zone)} · ${clock()}`
  // Tooltips only render on the client, so reading the reader's zone here is safe.
  const tooltipZone = local ? 'UTC' : (readerZone ?? localZone())
  const tooltip = firstAt ? (
    <span className="flex flex-col">
      <span>First reported {formatDateTime(firstAt, tooltipZone)}</span>
      {firstAt !== at ? <span>Updated {formatDateTime(at, tooltipZone)}</span> : null}
    </span>
  ) : (
    formatDateTime(at, tooltipZone)
  )

  return (
    <Tooltip content={tooltip}>
      <time dateTime={at} className={className} suppressHydrationWarning>
        {prefix ? `${prefix} ` : null}
        {text}
      </time>
    </Tooltip>
  )
}
