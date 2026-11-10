import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'

import { assertRuntimeEnv } from '#/server/env'
import { clientIpFromHeaders } from '#/server/ip'
import { consumeServerFnRateLimit, tooManyRequests } from '#/server/rate-limit'

const envMiddleware = createMiddleware().server((ctx) => {
  // Request middleware bodies are server-only; this keeps production secret
  // checks out of the browser bundle and fails the first request when the
  // deployment is misconfigured.
  assertRuntimeEnv()
  return ctx.next()
})

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
      envMiddleware,
      csrfMiddleware,
      rateLimitMiddleware,
      privateCacheMiddleware,
    ],
  }
})
