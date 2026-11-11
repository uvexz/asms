import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'

import { db } from '#/db'
import { domains, mailboxes, messages } from '#/db/schema'
import { asUser } from '../session'
import { isExpired } from '../services/mailboxes'
import { getSendUsage } from '../services/quota'
import { getSetting } from '../settings'

export const fetchOverview = createServerFn({ method: 'GET' }).handler(
  async () =>
    asUser(async ({ user }) => {
      const mailboxRows = await db
        .select({
          id: mailboxes.id,
          kind: mailboxes.kind,
          localPart: mailboxes.localPart,
          domain: domains.name,
          expiresAt: mailboxes.expiresAt,
          lastReceivedAt: mailboxes.lastReceivedAt,
        })
        .from(mailboxes)
        .innerJoin(domains, eq(mailboxes.domainId, domains.id))
        .where(
          and(eq(mailboxes.userId, user.id), eq(mailboxes.status, 'active')),
        )

      const active = mailboxRows.filter((row) => !isExpired(row))
      const ids = active.map((row) => row.id)

      const [unreadRow, recentRows, timeZone] = await Promise.all([
        ids.length > 0
          ? db
              .select({ value: count() })
              .from(messages)
              .where(
                and(
                  inArray(messages.mailboxId, ids),
                  eq(messages.isRead, false),
                ),
              )
              .get()
          : Promise.resolve({ value: 0 }),
        ids.length > 0
          ? db
              .select({
                id: messages.id,
                subject: messages.subject,
                fromAddress: messages.fromAddress,
                fromName: messages.fromName,
                isRead: messages.isRead,
                receivedAt: messages.receivedAt,
                mailboxId: mailboxes.id,
                localPart: mailboxes.localPart,
                domain: domains.name,
              })
              .from(messages)
              .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
              .innerJoin(domains, eq(mailboxes.domainId, domains.id))
              .where(inArray(messages.mailboxId, ids))
              .orderBy(desc(messages.receivedAt))
              .limit(6)
          : Promise.resolve([]),
        getSetting('site.timezone'),
      ])

      const usage = await getSendUsage({
        userId: user.id,
        role: user.role ?? 'user',
        timeZone,
      })

      return {
        mailboxes: active.length,
        permanent: active.filter((row) => row.kind === 'permanent').length,
        temporary: active.filter((row) => row.kind === 'temporary').length,
        unread: unreadRow?.value ?? 0,
        usage,
        recent: recentRows.map((row) => ({
          id: row.id,
          subject: row.subject,
          fromAddress: row.fromAddress,
          fromName: row.fromName,
          isRead: row.isRead,
          receivedAt: row.receivedAt.toISOString(),
          mailboxAddress: `${row.localPart}@${row.domain}`,
          mailboxId: row.mailboxId,
        })),
      }
    }),
)
