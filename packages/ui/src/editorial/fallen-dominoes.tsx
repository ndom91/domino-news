import { type CSSProperties, useRef } from 'react'
import { cx } from '../cx.ts'
import { useWidth } from '../primitives/use-width.ts'

/** Two dominoes on the accent panel, the lower one with its right half missing (404 page). */
export function MissingPiece({ className }: { className?: string }) {
  const dots = (
    <>
      <circle cx={-115} cy={-35} r={12} />
      <circle cx={-45} cy={-35} r={12} />
      <circle cx={-115} cy={35} r={12} />
      <circle cx={-45} cy={35} r={12} />
    </>
  )
  // Left half with square right corners, so the divider and missing half sit flush.
  const half = (
    <>
      <rect x={-159} y={-80} width={159} height={160} rx={14} />
      <rect x={-20} y={-80} width={20} height={160} />
    </>
  )
  return (
    <svg viewBox="0 0 540 400" aria-hidden className={cx('block', className)}>
      {/* Drop shadows first, offset down and right. */}
      <g className="fill-accent-shade">
        <g transform="translate(308 296) rotate(8)">{half}</g>
        <rect
          x={-159}
          y={-81}
          width={318}
          height={162}
          rx={14}
          transform="translate(251 127) rotate(-4.5)"
        />
      </g>
      <g transform="translate(298 286) rotate(8)">
        <g className="fill-accent-contrast">{half}</g>
        <g className="fill-band-text">{dots}</g>
        <line x1={0} x2={0} y1={-80} y2={80} strokeWidth={4} className="stroke-band-text" />
        {/* Square on the left, where it meets the divider; rounded like the piece on the right. */}
        <path
          d="M4 -78 H143 A14 14 0 0 1 157 -64 V64 A14 14 0 0 1 143 78 H4 Z"
          fill="none"
          strokeWidth={3}
          strokeDasharray="9 6"
          className="stroke-accent-contrast"
        />
        <text
          x={80}
          y={5}
          textAnchor="middle"
          className="fill-accent-contrast text-[15px] font-bold tracking-label uppercase"
        >
          Missing
        </text>
      </g>
      <g transform="translate(241 117) rotate(-4.5)">
        <rect x={-159} y={-81} width={318} height={162} rx={14} className="fill-accent-contrast" />
        <g className="fill-band-text">{dots}</g>
        <line x1={0} x2={0} y1={-81} y2={81} strokeWidth={4} className="stroke-band-text" />
      </g>
    </svg>
  )
}

const PIECE = { width: 18, height: 72 }
// Gap between pieces, and the space kept clear right of the two standing pieces.
const SPACING = { wide: 44, narrow: 32 }
const END_MARGIN = { wide: 88, narrow: 40 }
// Keep in sync with .t-topple in motion.css.
const FALL_MS = 260
const STAGGER_MS = 70

/**
 * A chain of dominoes along a ground line that topples left to right and stops at a missing
 * piece ("You are here"); the two after the gap stay standing. Fills its width, so the count
 * is measured on the client. Change `run` to knock them over again.
 */
export function DominoRun({ run = 0, className }: { run?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const width = useWidth(ref)

  const size = width !== null && width < 640 ? 'narrow' : 'wide'
  const step = SPACING[size]
  // Leave room for the gap and the two standing pieces (the -3).
  const fallen = width === null ? 0 : Math.max(3, Math.floor((width - END_MARGIN[size]) / step) - 3)
  const x = (i: number) => 16 + i * step

  return (
    <div ref={ref} aria-hidden className={cx('relative h-28 border-b-4 border-rule', className)}>
      {width === null ? null : (
        <div key={run}>
          {Array.from({ length: fallen }, (_, i) => (
            <Piece
              // biome-ignore lint/suspicious/noArrayIndexKey: identical pieces in a fixed order
              key={i}
              left={x(i)}
              className="t-topple"
              style={{ '--topple-i': i } as CSSProperties}
            />
          ))}
          <div
            className="absolute bottom-0 border-2 border-dashed border-accent"
            style={{ left: x(fallen), width: PIECE.width + 4, height: PIECE.height }}
          />
          <p
            className="t-pop absolute -translate-x-1/2 type-label whitespace-nowrap text-accent-text"
            style={{
              left: x(fallen) + PIECE.width / 2,
              bottom: PIECE.height + 10,
              animationDelay: `${fallen * STAGGER_MS + FALL_MS}ms`,
            }}
          >
            You are here
          </p>
          <Piece left={x(fallen + 1)} />
          <Piece left={x(fallen + 2)} />
        </div>
      )}
    </div>
  )
}

function Piece({
  left,
  className,
  style,
}: {
  left: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={cx(
        'absolute bottom-0 flex flex-col items-center justify-around rounded-[3px] bg-text py-2 outline-2 outline-canvas',
        className,
      )}
      style={{ left, width: PIECE.width, height: PIECE.height, ...style }}
    >
      <span className="size-1.5 rounded-full bg-canvas" />
      <span className="size-1.5 rounded-full bg-canvas" />
    </div>
  )
}
