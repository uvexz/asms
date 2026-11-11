import { clientIpFromHeaders } from './ip'
import { RATE_LIMITS, consumeRateLimit, tooManyRequests } from './rate-limit'
import type { RateLimitRule } from './rate-limit'

const AUTH_BASE_PATH = '/api/auth'
const MAX_ACCOUNT_BODY_BYTES = 64 * 1024
const RATE_LIMITED_MESSAGE = '尝试过于频繁，请稍后再试'

type AuthRule = {
  ip: RateLimitRule
  account?: RateLimitRule
}

/**
 * Path rules sit in front of Better Auth's handler. The built-in limiter is
 * disabled in src/lib/auth.ts: it keys only by IP and keeps counters in
 * process memory, which neither survives serverless instances nor slows a
 * distributed attack on one account.
 */
const RULES: Record<string, AuthRule> = {
  '/sign-in/email': {
    ip: RATE_LIMITS.authSignInIp,
    account: RATE_LIMITS.authSignInAccount,
  },
  '/sign-up/email': { ip: RATE_LIMITS.authSignUpIp },
  '/request-password-reset': {
    ip: RATE_LIMITS.authPasswordResetIp,
    account: RATE_LIMITS.authPasswordResetAccount,
  },
  '/reset-password': { ip: RATE_LIMITS.authResetPasswordIp },
  '/change-password': { ip: RATE_LIMITS.authChangePasswordIp },
  '/change-email': { ip: RATE_LIMITS.authChangeEmailIp },
  '/delete-user': { ip: RATE_LIMITS.authDeleteUserIp },
  '/update-user': { ip: RATE_LIMITS.authUpdateUserIp },
  '/get-session': { ip: RATE_LIMITS.authGetSessionIp },
  '/sign-out': { ip: RATE_LIMITS.authSignOutIp },
}

const ADMIN_RULE: AuthRule = { ip: RATE_LIMITS.authAdminIp }
const DEFAULT_RULE: AuthRule = { ip: RATE_LIMITS.authDefault }

function authPath(pathname: string): string {
  if (pathname === AUTH_BASE_PATH) return '/'
  return pathname.startsWith(`${AUTH_BASE_PATH}/`)
    ? pathname.slice(AUTH_BASE_PATH.length)
    : pathname
}

/**
 * Password endpoints carry the target account in a JSON body. Reading a clone
 * leaves the original stream untouched for Better Auth; a missing or oversized
 * body simply skips the per-account counter and leaves the IP rule in charge.
 */
async function bodyEmail(request: Request): Promise<string | null> {
  if (request.method !== 'POST') return null
  const declared = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > MAX_ACCOUNT_BODY_BYTES) {
    return null
  }
  try {
    const body = (await request.clone().json()) as { email?: unknown }
    if (typeof body?.email !== 'string') return null
    const email = body.email.trim().toLowerCase().slice(0, 320)
    return email || null
  } catch {
    return null
  }
}

/** Returns a 429 response when the request must not reach Better Auth. */
export async function applyAuthRateLimit(
  request: Request,
): Promise<Response | null> {
  const ip = clientIpFromHeaders(request.headers) ?? 'unknown'
  const path = authPath(new URL(request.url).pathname)

  const global = await consumeRateLimit(RATE_LIMITS.authAll, ip)
  if (!global.allowed) {
    return tooManyRequests(global.retryAfter, RATE_LIMITED_MESSAGE)
  }

  const rule =
    RULES[path] ?? (path.startsWith('/admin/') ? ADMIN_RULE : DEFAULT_RULE)
  const byIp = await consumeRateLimit(rule.ip, ip)
  if (!byIp.allowed) {
    return tooManyRequests(byIp.retryAfter, RATE_LIMITED_MESSAGE)
  }

  if (rule.account) {
    const email = await bodyEmail(request)
    if (email) {
      const byAccount = await consumeRateLimit(rule.account, email)
      if (!byAccount.allowed) {
        return tooManyRequests(byAccount.retryAfter, RATE_LIMITED_MESSAGE)
      }
    }
  }

  return null
}
