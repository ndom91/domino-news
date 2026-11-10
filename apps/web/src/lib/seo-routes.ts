// The public pages, and server-only helpers for robots.txt and sitemap.xml.

/** The about, contact and legal pages, linked from every footer and the login page. */
export const LEGAL_LINKS = [
  { to: '/about', label: 'About' },
  { to: '/contact-us', label: 'Contact us' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/terms', label: 'Terms' },
  { to: '/imprint', label: 'Imprint' },
] as const

/**
 * Readable without an account (the imprint and privacy policy must be reachable by anyone),
 * and the only pages search engines may index: sign-in, the pages above and deletion steps.
 */
export const PUBLIC_PATHS: readonly string[] = [
  '/login',
  ...LEGAL_LINKS.map((link) => link.to),
  '/delete-account',
]

/** BETTER_AUTH_URL is the public origin in every deployment; the request is a fallback. */
export function publicOrigin(request: Request) {
  return process.env.BETTER_AUTH_URL?.replace(/\/$/, '') ?? new URL(request.url).origin
}
