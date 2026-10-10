import type { ComponentType, ReactNode } from 'react'

/** Router-agnostic link component (TanStack Link on web, plain <a> in Playroom). */
export type LinkLike = ComponentType<{ to: string; className?: string; children: ReactNode }>

export const DefaultLink: LinkLike = ({ to, className, children }) => (
  <a href={to} className={className}>
    {children}
  </a>
)
