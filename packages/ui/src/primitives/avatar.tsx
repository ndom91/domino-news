import { NARRATIVE_COLORS } from '@dn/design-tokens'
import BoringAvatar from 'boring-avatars'
import { cx } from '../cx.ts'

// The desk colours (slots 1–6), so avatars belong to the same palette as the story bars.
// SVG fills need literal hex values, not CSS variables.
const AVATAR_COLORS = NARRATIVE_COLORS.slice(1).map(([fill]) => fill)

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
