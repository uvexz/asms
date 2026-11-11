import { sql } from 'drizzle-orm'
import { createHmac } from 'node:crypto'

import { db } from '#/db'
import { rateLimits } from '#/db/schema'
import { AppError } from './result'

export type RateLimitRule = {
  scope: string
  limit: number
  windowMs: number
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/**
 * Every ceiling in the app, in one place. Values are deliberately in code
 * rather than the settings table: a misconfigured or compromised admin panel
 * must not be able to remove the guard that protects it. Scopes are stable
 * storage keys; renaming one resets its counters.
 */
export const RATE_LIMITS = {
  // Authenticated server functions, keyed by user id.
  userRequest: { scope: 'user.request', limit: 240, windowMs: MINUTE },
  adminRequest: { scope: 'admin.request', limit: 240, windowMs: MINUTE },
  tempMailboxCreate: {
    scope: 'mailbox.create.temporary',
    limit: 30,
    windowMs: HOUR,
  },
  permanentMailboxCreate: {
    scope: 'mailbox.create.permanent',
    limit: 10,
    windowMs: HOUR,
  },
  mailboxDelete: { scope: 'mailbox.delete', limit: 30, windowMs: MINUTE },
  messageMutate: { scope: 'messages.mutate', limit: 120, windowMs: MINUTE },
  sendMail: { scope: 'mail.send', limit: 10, windowMs: MINUTE },
  telegramLink: { scope: 'telegram.link', limit: 5, windowMs: HOUR },
  telegramAction: { scope: 'telegram.action', limit: 30, windowMs: MINUTE },
  setupClaim: { scope: 'setup.claim', limit: 5, windowMs: HOUR },
  attachmentDownload: {
    scope: 'attachment.download',
    limit: 60,
    windowMs: MINUTE,
  },

  // HTTP surface, keyed by client IP in src/start.ts.
  serverFnIp: { scope: 'http.serverFn.ip', limit: 600, windowMs: MINUTE },
  apiIp: { scope: 'http.api.ip', limit: 120, windowMs: MINUTE },
  attachmentIp: { scope: 'http.attachment.ip', limit: 120, windowMs: MINUTE },
  webhookResendIp: {
    scope: 'http.webhook.resend.ip',
    limit: 600,
    windowMs: MINUTE,
  },
  webhookTelegramIp: {
    scope: 'http.webhook.telegram.ip',
    limit: 600,
    windowMs: MINUTE,
  },
  cronIp: { scope: 'http.cron.ip', limit: 20, windowMs: MINUTE },

  // Auth endpoints, keyed by IP and (for password flows) account email.
  authAll: { scope: 'auth.all.ip', limit: 300, windowMs: MINUTE },
  authDefault: { scope: 'auth.default.ip', limit: 120, windowMs: MINUTE },
  authSignInIp: {
    scope: 'auth.sign-in.ip',
    limit: 20,
    windowMs: 10 * MINUTE,
  },
  authSignInAccount: {
    scope: 'auth.sign-in.account',
    limit: 10,
    windowMs: 15 * MINUTE,
  },
  authSignUpIp: { scope: 'auth.sign-up.ip', limit: 10, windowMs: HOUR },
  authVerificationEmailIp: {
    scope: 'auth.verification-email.ip',
    limit: 5,
    windowMs: 15 * MINUTE,
  },
  authVerificationEmailAccount: {
    scope: 'auth.verification-email.account',
    limit: 3,
    windowMs: HOUR,
  },
  authPasswordResetIp: {
    scope: 'auth.password-reset.ip',
    limit: 5,
    windowMs: 15 * MINUTE,
  },
  authPasswordResetAccount: {
    scope: 'auth.password-reset.account',
    limit: 3,
    windowMs: HOUR,
  },
  authResetPasswordIp: {
    scope: 'auth.reset-password.ip',
    limit: 10,
    windowMs: 15 * MINUTE,
  },
  authChangePasswordIp: {
    scope: 'auth.change-password.ip',
    limit: 10,
    windowMs: 15 * MINUTE,
  },
  authChangeEmailIp: {
    scope: 'auth.change-email.ip',
    limit: 10,
    windowMs: HOUR,
  },
  authDeleteUserIp: {
    scope: 'auth.delete-user.ip',
    limit: 5,
    windowMs: HOUR,
  },
  authUpdateUserIp: {
    scope: 'auth.update-user.ip',
    limit: 30,
    windowMs: 10 * MINUTE,
  },
  authGetSessionIp: {
    scope: 'auth.get-session.ip',
    limit: 300,
    windowMs: MINUTE,
  },
  authSignOutIp: {
    scope: 'auth.sign-out.ip',
    limit: 30,
    windowMs: MINUTE,
  },
  authAdminIp: { scope: 'auth.admin.ip', limit: 60, windowMs: MINUTE },
} as const satisfies Record<string, RateLimitRule>

export type RateLimitResult = {
  allowed: boolean
  retryAfter: number
}

type MemoryBucket = { count: number; resetAt: number }

const memoryBuckets = new Map<string, MemoryBucket>()
const MEMORY_KEY_LIMIT = 10_000
let lastStoreErrorAt = 0

/**
 * The key never contains the raw identity. That keeps IP addresses, emails
 * and user ids out of a table that is only there to count requests.
 */
function hashIdentity(scope: string, identity: string): string {
  const secret =
    process.env.BETTER_AUTH_SECRET ||
    process.env.ASMS_ENCRYPTION_KEY ||
    'asms-rate-limit'
  return createHmac('sha256', secret)
    .update(`${scope}\u0000${identity}`)
    .digest('hex')
}

async function consumeDatabase(
  key: string,
  rule: RateLimitRule,
  now: number,
): Promise<RateLimitResult> {
  const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs
  const expiresAt = windowStart + rule.windowMs

  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, hits: 1, expiresAt })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        // A changed window resets the counter; SQLite evaluates every SET
        // expression against the old row, so the comparison is still valid.
        hits: sql`case when ${rateLimits.windowStart} = ${windowStart} then ${rateLimits.hits} + 1 else 1 end`,
        windowStart,
        expiresAt,
      },
    })
    .returning({ hits: rateLimits.hits, expiresAt: rateLimits.expiresAt })

  const hits = row?.hits ?? 1
  const end = row?.expiresAt ?? expiresAt
  return {
    allowed: hits <= rule.limit,
    retryAfter: Math.max(1, Math.ceil((end - now) / 1000)),
  }
}

function consumeMemory(
  key: string,
  rule: RateLimitRule,
  now: number,
): RateLimitResult {
  if (memoryBuckets.size >= MEMORY_KEY_LIMIT) {
    for (const [bucketKey, bucket] of memoryBuckets) {
      if (bucket.resetAt <= now) memoryBuckets.delete(bucketKey)
    }
    if (memoryBuckets.size >= MEMORY_KEY_LIMIT) {
      let overflow = memoryBuckets.size - MEMORY_KEY_LIMIT + 1
      for (const bucketKey of memoryBuckets.keys()) {
        memoryBuckets.delete(bucketKey)
        if (--overflow <= 0) break
      }
    }
  }

  const existing = memoryBuckets.get(key)
  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + rule.windowMs })
    return { allowed: true, retryAfter: 0 }
  }

  existing.count += 1
  return {
    allowed: existing.count <= rule.limit,
    retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}

/**
 * Fixed-window counter shared by every instance through libSQL. When the
 * store itself fails the request is still protected by a process-local
 * fallback instead of failing open or taking the app down with it.
 */
export async function consumeRateLimit(
  rule: RateLimitRule,
  identity: string,
): Promise<RateLimitResult> {
  const key = hashIdentity(rule.scope, identity)
  const now = Date.now()
  try {
    return await consumeDatabase(key, rule, now)
  } catch (error) {
    if (now - lastStoreErrorAt > MINUTE) {
      lastStoreErrorAt = now
      console.error(
        '[asms] rate limit store unavailable; using in-memory fallback',
        error,
      )
    }
    return consumeMemory(key, rule, now)
  }
}

function formatWait(seconds: number): string {
  return seconds < 60 ? `${seconds} 秒` : `${Math.ceil(seconds / 60)} 分钟`
}

/** Server-function flavour: the caller turns this into a structured failure. */
export async function enforceRateLimit(
  rule: RateLimitRule,
  identity: string,
): Promise<void> {
  const result = await consumeRateLimit(rule, identity)
  if (result.allowed) return
  throw new AppError(
    'RATE_LIMITED',
    `操作过于频繁，请 ${formatWait(result.retryAfter)}后再试`,
  )
}

/** HTTP flavour: API routes and the request middleware answer with 429. */
export function tooManyRequests(
  retryAfter: number,
  message = '请求过于频繁，请稍后再试',
): Response {
  return Response.json(
    { code: 'RATE_LIMITED', message },
    {
      status: 429,
      headers: {
        'cache-control': 'no-store',
        'retry-after': String(retryAfter),
        'x-retry-after': String(retryAfter),
      },
    },
  )
}
