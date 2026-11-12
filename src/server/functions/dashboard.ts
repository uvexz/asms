import { and, count, desc, eq } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'

import { db } from '#/db'
import { domains, mailboxes, messages } from '#/db/schema'
import { asUser } from '../session'
import { liveMailboxCondition } from '../services/mailboxes'
import { getSendUsage } from '../services/quota'
import { getSetting } from '../settings'

export const fetchOverview = createServerFn({ method: 'GET' }).handler(
  async () =>
    asUser(async ({ user }) => {
      // Everything the overview counts reads from the same set: the user's
      // live mailboxes. Stating it once keeps the four reads aligned, and it
      // is the same predicate the mailbox rail uses.
      const scope = and(
        eq(mailboxes.userId, user.id),
        eq(mailboxes.status, 'active'),
        liveMailboxCondition(new Date()),
      )

      // The timezone is a cached setting, so this costs nothing on a warm
      // process and keeps the quota read inside the batch below instead of
      // after it.
      const timeZone = await getSetting('site.timezone')

      const [kindRows, unreadRow, recentRows, usage] = await Promise.all([
        db
          .select({ kind: mailboxes.kind, value: count() })
          .from(mailboxes)
          .where(scope)
          .groupBy(mailboxes.kind),
        db
          .select({ value: count() })
          .from(messages)
          .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
          .where(and(scope, eq(messages.isRead, false)))
          .get(),
        db
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
          .where(scope)
          .orderBy(desc(messages.receivedAt))
          .limit(6),
        getSendUsage({
          userId: user.id,
          role: user.role ?? 'user',
          timeZone,
        }),
      ])

      const byKind = new Map(kindRows.map((row) => [row.kind, row.value]))

      return {
        mailboxes: kindRows.reduce((sum, row) => sum + row.value, 0),
        permanent: byKind.get('permanent') ?? 0,
        temporary: byKind.get('temporary') ?? 0,
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
