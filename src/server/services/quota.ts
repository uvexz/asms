import { and, eq, sql } from 'drizzle-orm'

import { db } from '#/db'
import { sendQuota } from '#/db/schema'
import { AppError } from '../result'
import { getSetting } from '../settings'

const dayFormatters = new Map<string, Intl.DateTimeFormat>()

/**
 * Building a formatter costs ~60× more than using one, and this runs on every
 * overview poll and every send. Timezones are a handful of values, so one
 * instance each is bounded.
 */
function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = dayFormatters.get(timeZone)
  if (cached) return cached
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  dayFormatters.set(timeZone, formatter)
  return formatter
}

function quotaDateFor(timeZone: string, date = new Date()): string {
  try {
    return dayFormatter(timeZone).format(date)
  } catch {
    // An unknown timezone throws while constructing; fall back for this call
    // without caching the failure.
    return dayFormatter('UTC').format(date)
  }
}

/**
 * Takes one unit of today's quota. The read and the increment used to be an
 * interactive transaction — four round trips (`BEGIN`, `SELECT`, `UPDATE`,
 * `COMMIT`) with a write lock held across the two statements in the middle, so
 * two sends racing at the limit could both read `used = limit - 1`. A single
 * upsert does the same check and the same increment atomically: the `where` on
 * the update runs against the row the conflict hit, and an update that the
 * `where` rejects returns no row, which is the "quota exhausted" answer.
 *
 * `where send_quota.used < ?` needs the table-qualified name — SQLite resolves
 * an unqualified column in `DO UPDATE` to the *new* row, and the comparison
 * would always be false.
 */
export async function reserveSendQuota(input: {
  userId: string
  role: string
  limit: number
  timeZone: string
}): Promise<{ used: number; limit: number }> {
  if (input.role === 'admin') {
    return { used: 0, limit: Number.POSITIVE_INFINITY }
  }
  if (input.limit <= 0) {
    throw new AppError('SEND_QUOTA_EXCEEDED', '管理员已关闭发件功能')
  }

  const date = quotaDateFor(input.timeZone)

  // `db.all` rather than `db.get`: the driver maps a single row through
  // `Object.keys`, so a statement that returns no row — which is exactly the
  // "over quota" answer — would throw instead of returning nothing.
  const rows = await db.all<{ used: number }>(sql`
    insert into send_quota (user_id, quota_date, used)
    values (${input.userId}, ${date}, 1)
    on conflict (user_id, quota_date) do update
      set used = send_quota.used + 1
      where send_quota.used < ${input.limit}
    returning used
  `)

  const row = rows[0]
  if (!row) {
    throw new AppError(
      'SEND_QUOTA_EXCEEDED',
      `今日发件额度已用完（${input.limit} 封）`,
    )
  }
  return { used: row.used, limit: input.limit }
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
