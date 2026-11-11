import { and, eq, sql } from 'drizzle-orm'

import { db } from '#/db'
import { sendQuota } from '#/db/schema'
import { AppError } from '../result'
import { getSetting } from '../settings'

function quotaDateFor(timeZone: string, date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  }
}

export async function reserveSendQuota(input: {
  userId: string
  role: string
  limit: number
  timeZone: string
}): Promise<{ used: number; limit: number }> {
  if (input.role === 'admin') {
    return { used: 0, limit: Number.POSITIVE_INFINITY }
  }

  const date = quotaDateFor(input.timeZone)

  return db.transaction(async (tx) => {
    const row = await tx
      .select()
      .from(sendQuota)
      .where(
        and(eq(sendQuota.userId, input.userId), eq(sendQuota.quotaDate, date)),
      )
      .get()

    if (!row) {
      await tx.insert(sendQuota).values({
        userId: input.userId,
        quotaDate: date,
        used: 1,
      })
      return { used: 1, limit: input.limit }
    }

    if (row.used >= input.limit) {
      throw new AppError(
        'SEND_QUOTA_EXCEEDED',
        `今日发件额度已用完（${input.limit} 封）`,
      )
    }

    const next = row.used + 1
    await tx
      .update(sendQuota)
      .set({ used: next })
      .where(
        and(eq(sendQuota.userId, input.userId), eq(sendQuota.quotaDate, date)),
      )
    return { used: next, limit: input.limit }
  })
}

export async function releaseSendQuota(userId: string, timeZone: string) {
  const date = quotaDateFor(timeZone)
  await db
    .update(sendQuota)
    .set({ used: sql`max(${sendQuota.used} - 1, 0)` })
    .where(and(eq(sendQuota.userId, userId), eq(sendQuota.quotaDate, date)))
}

export async function getSendUsage(input: {
  userId: string
  role: string
  timeZone: string
}) {
  const limit = await getSetting('mail.dailySendLimit')
  if (input.role === 'admin') {
    return { used: 0, limit: -1, unlimited: true }
  }

  const date = quotaDateFor(input.timeZone)
  const row = await db
    .select()
    .from(sendQuota)
    .where(
      and(eq(sendQuota.userId, input.userId), eq(sendQuota.quotaDate, date)),
    )
    .get()

  return { used: row?.used ?? 0, limit, unlimited: false }
}
