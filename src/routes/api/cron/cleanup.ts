import { createFileRoute } from '@tanstack/react-router'

import { runCleanup } from '#/server/services/cleanup'

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  const header = request.headers.get('authorization')
  if (header === `Bearer ${secret}`) return true
  const url = new URL(request.url)
  return url.searchParams.get('secret') === secret
}

export const Route = createFileRoute('/api/cron/cleanup')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) {
          return new Response('Unauthorized', { status: 401 })
        }
        const result = await runCleanup()
        return Response.json(result)
      },
      POST: async ({ request }) => {
        if (!authorized(request)) {
          return new Response('Unauthorized', { status: 401 })
        }
        const result = await runCleanup()
        return Response.json(result)
      },
    },
  },
})
