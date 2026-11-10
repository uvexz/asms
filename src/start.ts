import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'

import { assertRuntimeEnv } from '#/server/env'
import { clientIpFromHeaders } from '#/server/ip'
import { consumeServerFnRateLimit, tooManyRequests } from '#/server/rate-limit'

// Run while the start entry is loaded, not inside getOptions: a throw inside
// the options callback is logged and the request continues without these
// middlewares, which is the opposite of failing closed.
assertRuntimeEnv()

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

const rateLimitMiddleware = createMiddleware().server((ctx) => {
  if (ctx.handlerType !== 'serverFn') return ctx.next()
  const method = ctx.request.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD') return ctx.next()

  const ip = clientIpFromHeaders(ctx.request.headers) ?? 'unknown'
  const result = consumeServerFnRateLimit(`serverFn:${ip}`)
  if (!result.allowed) return tooManyRequests(result.retryAfter)
  return ctx.next()
})

const privateCacheMiddleware = createMiddleware().server(async (ctx) => {
  const result = await ctx.next()
  const hasSession = (ctx.request.headers.get('cookie') ?? '').includes(
    'session_token',
  )
  const isHtml = (ctx.request.headers.get('accept') ?? '').includes('text/html')
  // Do not mark static assets or JSON API responses as uncacheable just
  // because the browser happened to attach its session cookie.
  if (ctx.handlerType === 'serverFn' || (hasSession && isHtml)) {
    result.response.headers.set('cache-control', 'private, no-store')
  }
  return result
})

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [
      csrfMiddleware,
      rateLimitMiddleware,
      privateCacheMiddleware,
    ],
  }
})
