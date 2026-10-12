import { createFileRoute } from '@tanstack/react-router'
import { INDEXED_PATHS, publicOrigin } from '../lib/seo-routes.ts'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = publicOrigin(request)
        const urls = INDEXED_PATHS.map((path) => `  <url><loc>${origin}${path}</loc></url>`)
        const body = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...urls,
          '</urlset>',
          '',
        ].join('\n')
        return new Response(body, {
          headers: {
            'content-type': 'application/xml; charset=utf-8',
            'cache-control': 'public, max-age=86400',
          },
        })
      },
    },
  },
})
