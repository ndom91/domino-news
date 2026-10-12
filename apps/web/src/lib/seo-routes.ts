// Server-only helpers for robots.txt and sitemap.xml.

/** Pages search engines may index: the signed-out landing page and the public pages. */
export const INDEXED_PATHS = ['/login', '/about', '/privacy', '/terms', '/imprint']

/** BETTER_AUTH_URL is the public origin in every deployment; the request is a fallback. */
export function publicOrigin(request: Request) {
  return process.env.BETTER_AUTH_URL?.replace(/\/$/, '') ?? new URL(request.url).origin
}
