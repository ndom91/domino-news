// Production entry: serves built client assets and hands everything else to TanStack Start.
import { serve } from 'srvx/node'
import { staticMiddleware } from 'srvx/static'
import app from './dist/server/server.js'

const dir = new URL('./dist/client', import.meta.url).pathname
// Files under /assets/ carry a content hash in their name (CSS, JS, fonts), so a new build
// gets new URLs: browsers and Cloudflare may keep them for a year without revalidating.
const hashed = staticMiddleware({ dir, maxAge: 31536000, immutable: true })
// Everything else (favicon, touch icon) keeps a stable name, so it revalidates.
const plain = staticMiddleware({ dir })

serve({
  port: Number(process.env.PORT ?? 4000),
  hostname: process.env.HOST ?? '0.0.0.0',
  middleware: [
    (request, next) =>
      new URL(request.url).pathname.startsWith('/assets/')
        ? hashed(request, next)
        : plain(request, next),
  ],
  fetch: app.fetch,
})
