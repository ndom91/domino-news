import { createFileRoute } from '@tanstack/react-router'

// Mounts the framework-independent /api/v1 router. Same handlers serve web and future native apps.
const handle = async ({ request }: { request: Request }) => {
  const { getServerContext } = await import('@dn/server')
  const { handleApiRequest } = await import('@dn/server/api')
  return handleApiRequest(getServerContext(), request)
}

export const Route = createFileRoute('/api/v1/$')({
  server: { handlers: { GET: handle, POST: handle } },
})
