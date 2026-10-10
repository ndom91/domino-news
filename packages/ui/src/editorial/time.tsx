import { formatDateTime, relativeTime } from '@dn/domain'
import { cx } from '../cx.ts'

/** Relative time with the exact UTC time available to all users (title + datetime). */
export function Timestamp({
  iso,
  prefix,
  className,
}: {
  iso: string
  prefix?: string
  className?: string
}) {
  return (
    <time
      dateTime={iso}
      title={formatDateTime(iso)}
      className={cx('font-mono text-xs text-text-muted', className)}
    >
      {prefix ? `${prefix} ` : null}
      {relativeTime(iso)}
    </time>
  )
}
