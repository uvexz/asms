import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'

import { db } from '#/db'
import { domains, mailboxes, messages } from '#/db/schema'
import { asUser } from '../session'
import { getSendUsage } from '../services/quota'
import { getSetting } from '../settings'

export const fetchOverview = createServerFn({ method: 'GET' }).handler(
  async () =>
    asUser(async ({ user }) => {
      const now = new Date()
      const mailboxRows = await db
        .select({
          id: mailboxes.id,
          kind: mailboxes.kind,
          localPart: mailboxes.localPart,
          domain: domains.name,
          expiresAt: mailboxes.expiresAt,
        })
        .from(mailboxes)
        .innerJoin(domains, eq(mailboxes.domainId, domains.id))
        .where(
          and(eq(mailboxes.userId, user.id), eq(mailboxes.status, 'active')),
        )

      const active = mailboxRows.filter(
        (row) =>
          row.kind === 'permanent' ||
          (row.expiresAt && row.expiresAt.getTime() > now.getTime()),
      )
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
                message: messages,
                mailbox: mailboxes,
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
          id: row.message.id,
          subject: row.message.subject,
          fromAddress: row.message.fromAddress,
          fromName: row.message.fromName,
          isRead: row.message.isRead,
          receivedAt: row.message.receivedAt.toISOString(),
          mailboxAddress: `${row.mailbox.localPart}@${row.domain}`,
          mailboxId: row.mailbox.id,
        })),
      }
    }),
)
