import { createFileRoute } from '@tanstack/react-router'
import { createHash, timingSafeEqual } from 'node:crypto'

import { runCleanup } from '#/server/services/cleanup'

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const match = /^Bearer (.+)$/i.exec(
    request.headers.get('authorization') ?? '',
  )
  if (!match) return false

  const provided = createHash('sha256').update(match[1]).digest()
  const expected = createHash('sha256').update(secret).digest()
  return timingSafeEqual(provided, expected)
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
