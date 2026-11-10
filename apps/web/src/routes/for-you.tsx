import { createFileRoute, redirect } from '@tanstack/react-router'

// Briefing replaced the For You page; old links and bookmarks land there.
export const Route = createFileRoute('/for-you')({
  beforeLoad: () => {
    throw redirect({ to: '/briefing', replace: true })
  },
})
