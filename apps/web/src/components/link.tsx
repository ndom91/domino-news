import type { LinkLike } from '@dn/ui'
import { Link } from '@tanstack/react-router'

/** Adapter so router-agnostic editorial components get client-side navigation. */
export const RouterLink: LinkLike = ({ to, className, children }) => (
  <Link to={to} className={className}>
    {children}
  </Link>
)
