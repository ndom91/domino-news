const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

export function relativeTime(iso: string, now = new Date(), locale = 'en'): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return 'just now'
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, size] of UNITS) {
    if (abs >= size) return fmt.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

/** "10 Oct 2026, 14:06 UTC", in UTC unless another IANA time zone is given. */
export function formatDateTime(iso: string, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  }).format(new Date(iso))
}

/** "10 Oct", in UTC unless another IANA time zone is given. */
export function formatDate(iso: string, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone }).format(
    new Date(iso),
  )
}

/** Compact relative time used across the design: "just now", "24 min ago", "5 h ago", "3 d ago", else "9 Oct". */
export function shortRelative(iso: string, now = new Date()): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} d ago`
  return formatDate(iso)
}

/** 24-hour clock time, e.g. "18:05", in UTC unless another IANA time zone is given. */
export function clockTime(iso: string, timeZone = 'UTC'): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(iso))
}

/** Short name of the time zone at that moment: "UTC", "CEST", or "GMT-4" where there's no abbreviation. */
export function zoneName(iso: string, timeZone = 'UTC'): string {
  return (
    new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' })
      .formatToParts(new Date(iso))
      .find((p) => p.type === 'timeZoneName')?.value ?? timeZone
  )
}

/** "Saturday 10 October 2026" in UTC (the strip's edition date). */
export function longDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso))
}

const DAY = 24 * 3_600_000
const utcDay = (ms: number) => Math.floor(ms / DAY)

/** Feed day heading in UTC: "Today", "Yesterday", else "Thursday 8 Oct". */
export function dayLabel(iso: string, now: string | Date = new Date()): string {
  const diff = utcDay(new Date(now).getTime()) - utcDay(new Date(iso).getTime())
  if (diff <= 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(iso))
}

/**
 * Stories per UTC day, from `leadIn` empty days before the first Story through the last one.
 * The lead-in gives the line a baseline to rise from.
 */
export function storiesPerDay(times: string[], leadIn = 3) {
  const days = times.map((t) => utcDay(Date.parse(t)))
  if (days.length === 0) return []
  const first = Math.min(...days) - leadIn
  const counts = Array.from({ length: Math.max(...days) - first + 1 }, () => 0)
  for (const d of days) counts[d - first] = (counts[d - first] ?? 0) + 1
  return counts.map((count, i) => ({ day: new Date((first + i) * DAY).toISOString(), count }))
}

export const RECENCY_PERIODS = ['today', 'week', 'month', 'older'] as const
export type RecencyPeriod = (typeof RECENCY_PERIODS)[number]

/** Period for grouping lists by age: same UTC day, last 7 days, last 30 days, older. */
export function recencyPeriod(iso: string, now: string | Date = new Date()): RecencyPeriod {
  const diff = utcDay(new Date(now).getTime()) - utcDay(new Date(iso).getTime())
  if (diff <= 0) return 'today'
  if (diff < 7) return 'week'
  if (diff < 30) return 'month'
  return 'older'
}
