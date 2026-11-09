import { getRequestHeaders } from '@tanstack/react-start/server'

import { getAuth } from '#/lib/auth'
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

export async function getSession() {
  const auth = await getAuth()
  return auth.api.getSession({ headers: getRequestHeaders() })
}

export async function requireUser(): Promise<SessionContext> {
  const session = await getSession()
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
    return { ok: true, data: await fn(ctx) }
  } catch (error) {
    return fail(error)
  }
}

export function requestIp(): string | null {
  const headers = getRequestHeaders()
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-real-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null
  )
}

export function requestUserAgent(): string | null {
  return getRequestHeaders().get('user-agent')
}
