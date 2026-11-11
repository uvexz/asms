import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'

import { assertRuntimeEnv } from '#/server/env'
import { clientIpFromHeaders } from '#/server/ip'
import {
  RATE_LIMITS,
  consumeRateLimit,
  tooManyRequests,
} from '#/server/rate-limit'
import type { RateLimitRule } from '#/server/rate-limit'

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

/**
 * Auth has its own account-aware rules in `applyAuthRateLimit`. Everything
 * else is classified by path here; page and asset requests stay unlimited so
 * the limiter never gets between a browser and its static files.
 */
function routerRule(pathname: string): RateLimitRule | null {
  if (!pathname.startsWith('/api/')) return null
  if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) {
    return null
  }
  if (pathname.startsWith('/api/webhooks/resend')) {
    return RATE_LIMITS.webhookResendIp
  }
  if (pathname.startsWith('/api/telegram/webhook')) {
    return RATE_LIMITS.webhookTelegramIp
  }
  if (pathname.startsWith('/api/cron/')) return RATE_LIMITS.cronIp
  if (pathname.startsWith('/api/attachments/')) {
    return RATE_LIMITS.attachmentIp
  }
  return RATE_LIMITS.apiIp
}

const rateLimitMiddleware = createMiddleware().server(async (ctx) => {
  const pathname = new URL(ctx.request.url).pathname
  const rule =
    ctx.handlerType === 'serverFn'
      ? RATE_LIMITS.serverFnIp
      : routerRule(pathname)
  if (!rule) return ctx.next()

  const ip = clientIpFromHeaders(ctx.request.headers) ?? 'unknown'
  const result = await consumeRateLimit(rule, ip)
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
      rateLimitMiddleware,
      csrfMiddleware,
      privateCacheMiddleware,
    ],
  }
})
