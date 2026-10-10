import BoringAvatar from 'boring-avatars'
import { cx } from '../cx.ts'

// Theme colours as CSS variables, so the avatar follows light/dark without a re-render:
// the brand orange and the text colour (dark on light, near-white on dark).
const AVATAR_COLORS = ['var(--dn-accent)', 'var(--dn-text)']

/** Generated "marble" avatar for a user. Decorative: pair it with a visible or sr-only name. */
export function UserAvatar({
  name,
  size = 28,
  className,
}: {
  /** Stable seed (email, else name): the same user always gets the same avatar. */
  name: string
  size?: number
  className?: string
}) {
  return (
    <span aria-hidden className={cx('inline-flex flex-none', className)}>
      <BoringAvatar name={name} variant="marble" size={size} colors={AVATAR_COLORS} title={false} />
    </span>
  )
}
