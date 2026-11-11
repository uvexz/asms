import { createFileRoute } from '@tanstack/react-router'

import { getAuth } from '#/lib/auth'
import { applyAuthRateLimit } from '#/server/auth-rate-limit'

async function handleAuth(request: Request) {
  const limited = await applyAuthRateLimit(request)
  if (limited) return limited
  return (await getAuth()).handler(request)
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: async ({ request }) => handleAuth(request),
      POST: async ({ request }) => handleAuth(request),
    },
  },
})
