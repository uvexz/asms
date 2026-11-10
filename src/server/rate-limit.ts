type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const MAX_KEYS = 10_000

export const SERVER_FN_RATE_LIMIT = {
  limit: 120,
  windowMs: 60_000,
}

/**
 * Process-local fixed-window limiter for mutating server functions. Better
 * Auth's own limiter covers `/api/auth/*`; this covers the RPC surface, which
 * otherwise has no ceiling at all. Multi-instance deployments get one bucket
 * per instance, which is still enough to stop a single client loop.
 */
export function consumeServerFnRateLimit(key: string): {
  allowed: boolean
  retryAfter: number
} {
  const now = Date.now()
  if (buckets.size > MAX_KEYS) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey)
    }
    if (buckets.size > MAX_KEYS) buckets.clear()
  }

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + SERVER_FN_RATE_LIMIT.windowMs })
    return { allowed: true, retryAfter: 0 }
  }
  if (existing.count >= SERVER_FN_RATE_LIMIT.limit) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }

  existing.count += 1
  return { allowed: true, retryAfter: 0 }
}

export function tooManyRequests(retryAfter: number): Response {
  return new Response('Too Many Requests', {
    status: 429,
    headers: {
      'cache-control': 'no-store',
      'retry-after': String(retryAfter),
    },
  })
}
