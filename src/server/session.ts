import { getRequestHeaders } from '@tanstack/react-start/server'

import { getAuth } from '#/lib/auth'
import { clientIpFromHeaders } from './ip'
import { RATE_LIMITS, enforceRateLimit } from './rate-limit'
import { AppError, fail } from './result'
import type { Result } from './result'

export type SessionContext = {
  user: {
    id: string
    name: string
    email: string
    image?: string | null
    role?: string | null
  }
  session: {
    id: string
    token: string
    expiresAt: Date
  }
}

/**
 * `fresh` bypasses the signed session cookie cache and reads the session (and
 * its user row) from the database. Use it for checks that must see a ban or a
 * role change immediately, not on every ordinary read.
 */
export async function getSession(options?: { fresh?: boolean }) {
  const auth = await getAuth()
  return auth.api.getSession({
    headers: getRequestHeaders(),
    ...(options?.fresh ? { query: { disableCookieCache: true } } : {}),
  })
}

export async function requireUser(options?: {
  fresh?: boolean
}): Promise<SessionContext> {
  const session = await getSession(options)
  if (!session) {
    throw new AppError('UNAUTHORIZED', '请先登录')
  }
  if ((session.user as { banned?: boolean }).banned) {
    throw new AppError('ACCOUNT_BANNED', '账号已被封禁')
  }
  return session
}

export async function requireAdmin(): Promise<SessionContext> {
  const session = await requireUser()
  if (session.user.role !== 'admin') {
    throw new AppError('FORBIDDEN', '需要管理员权限')
  }
  return session
}

export async function asUser<T>(
  fn: (ctx: SessionContext) => Promise<T>,
): Promise<Result<T>> {
  try {
    const ctx = await requireUser()
    await enforceRateLimit(RATE_LIMITS.userRequest, ctx.user.id)
    return { ok: true, data: await fn(ctx) }
  } catch (error) {
    return fail(error)
  }
}

export async function asAdmin<T>(
  fn: (ctx: SessionContext) => Promise<T>,
): Promise<Result<T>> {
  try {
    const ctx = await requireAdmin()
    await enforceRateLimit(RATE_LIMITS.adminRequest, ctx.user.id)
    return { ok: true, data: await fn(ctx) }
  } catch (error) {
    return fail(error)
  }
}

export function requestIp(): string | null {
  return clientIpFromHeaders(getRequestHeaders())
}

export function requestUserAgent(): string | null {
  return getRequestHeaders().get('user-agent')
}
