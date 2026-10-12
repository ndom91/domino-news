import { createFileRoute } from '@tanstack/react-router'
import { INDEXED_PATHS, publicOrigin } from '../lib/seo-routes.ts'

// Only the public pages may be crawled; everything else sits behind login (and its signed-out
// teasers carry noindex). Link-preview bots don't read robots.txt for single URLs anyway.
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = publicOrigin(request)
        const body = [
          'User-agent: *',
          ...INDEXED_PATHS.map((path) => `Allow: ${path}$`),
          'Disallow: /',
          '',
          `Sitemap: ${origin}/sitemap.xml`,
          '',
        ].join('\n')
        return new Response(body, {
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'public, max-age=86400',
          },
        })
      },
    },
  },
})
