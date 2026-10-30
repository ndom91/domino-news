// Head tags for a page: title, description, Open Graph, Twitter and robots, plus a canonical
// link. TanStack keeps the deepest route's tag per name/property, so the root sets the
// site-wide defaults and pages override what they need.

export const SITE_NAME = 'Domino Wire'
export const SITE_DESCRIPTION =
  'Follow the news as it falls: one story, every source, and what came next.'

interface ShareImage {
  /** Path ("/og.png") or absolute URL. */
  url: string
  width: number
  height: number
  alt: string
}

/** The site-wide share card. Change the URL when replacing the image to refresh shared previews. */
export const DEFAULT_IMAGE: ShareImage = {
  url: '/og-domino-wire.png',
  width: 1024,
  height: 500,
  alt: 'Domino Wire: the story, and the story behind it',
}

export interface SeoInput {
  /** Public origin, from the session info (absolute URLs are required in share tags). */
  origin: string
  /** Path of this page, for og:url and the canonical link. */
  path: string
  /** Page title without the site name. Omit on the front page. */
  title?: string
  description?: string | null
  image?: ShareImage
  /** "summary" suits square images such as a publisher logo. */
  card?: 'summary' | 'summary_large_image'
  type?: 'website' | 'article' | 'profile'
  /** Only public pages are indexed; everything behind login stays out of search. */
  index?: boolean
}

const absolute = (origin: string, url: string) => (url.startsWith('http') ? url : origin + url)

export function seo({
  origin,
  path,
  title,
  description,
  image = DEFAULT_IMAGE,
  card = 'summary_large_image',
  type = 'website',
  index = false,
}: SeoInput) {
  const fullTitle = title ? `${title} · ${SITE_NAME}` : SITE_NAME
  const text = description ?? SITE_DESCRIPTION
  const url = absolute(origin, path)
  const imageUrl = absolute(origin, image.url)
  return {
    meta: [
      { title: fullTitle },
      { name: 'description', content: text },
      { name: 'robots', content: index ? 'index, follow' : 'noindex' },
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:type', content: type },
      { property: 'og:locale', content: 'en' },
      { property: 'og:title', content: title ?? SITE_NAME },
      { property: 'og:description', content: text },
      { property: 'og:url', content: url },
      { property: 'og:image', content: imageUrl },
      { property: 'og:image:width', content: String(image.width) },
      { property: 'og:image:height', content: String(image.height) },
      { property: 'og:image:alt', content: image.alt },
      { name: 'twitter:card', content: card },
      { name: 'twitter:title', content: title ?? SITE_NAME },
      { name: 'twitter:description', content: text },
      { name: 'twitter:image', content: imageUrl },
      { name: 'twitter:image:alt', content: image.alt },
    ],
    links: [{ rel: 'canonical', href: url }],
  }
}
