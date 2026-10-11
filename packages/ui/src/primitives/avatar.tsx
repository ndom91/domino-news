import BoringAvatar from 'boring-avatars'
import { cx } from '../cx.ts'

// Theme colours as CSS variables, so the avatar follows light/dark without a re-render:
// the brand orange and the text colour (dark on light, near-white on dark).
const AVATAR_COLORS = ['var(--dn-accent)', 'var(--dn-text)']

/** Generated "marble" avatar for a user. Decorative: pair it with a visible or sr-only name. */
export function UserAvatar({
  name,
  className,
}: {
  /** Stable seed (email, else name): the same user always gets the same avatar. */
  name: string
  className?: string
}) {
  return (
    <span aria-hidden className={cx('inline-flex flex-none', className)}>
      <BoringAvatar name={name} variant="marble" size={28} colors={AVATAR_COLORS} title={false} />
    </span>
  )
}

const MARBLE_COLORS = ['var(--dn-marble-cream)', 'var(--dn-accent)', 'var(--dn-marble-amber)']

/** Large decorative marble that fills its box (cropped, never stretched). */
export function Marble({ seed, className }: { seed: string; className?: string }) {
  return (
    <span aria-hidden className={cx('block overflow-hidden', className)}>
      <BoringAvatar
        name={seed}
        variant="marble"
        square
        colors={MARBLE_COLORS}
        title={false}
        preserveAspectRatio="xMidYMid slice"
        style={{ width: '100%', height: '100%' }}
      />
    </span>
  )
}
