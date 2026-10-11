/** A single ratio as a large figure over a filled track (ink on a lighter ink track). */
export function Meter({
  value,
  label,
  className,
}: {
  /** 0-1 */
  value: number
  label: string
  className?: string
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div className={className}>
      <p className="type-numeral">{pct}%</p>
      <meter className="sr-only" min={0} max={100} value={pct} aria-label={label}>
        {pct}%
      </meter>
      <div className="mt-2 h-2.5 bg-text/15" aria-hidden>
        <div className="h-full bg-text" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-sm text-text-secondary">{label}</p>
    </div>
  )
}
