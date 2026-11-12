import { and, eq, inArray, isNull, lt, lte, ne, or, sql } from 'drizzle-orm'

import { db } from '#/db'
import {
  addressReleases,
  attachments,
  auditLogs,
  ingestEvents,
  mailboxes,
  messages,
  rateLimits,
  sendQuota,
  sentEmails,
  session,
  verification,
} from '#/db/schema'
import {
  deleteObjectsStrict,
  getS3Config,
  isS3Configured,
} from '../integrations/storage'
import { getSetting } from '../settings'

const MESSAGE_BATCH = 1000
const MAILBOX_BATCH = 200
const CLEANUP_BUDGET_MS = 8_000
/** Long enough to answer "what did this account send last month", short enough
 * that the table stays proportional to active users. */
const QUOTA_RETENTION_DAYS = 90

export async function runCleanup() {
  const now = new Date()
  const deadline = Date.now() + CLEANUP_BUDGET_MS
  const retentionDays = await getSetting('mail.retentionDays')
  const messageCutoff = new Date(now.getTime() - retentionDays * 86_400_000)
  const keys = new Set<string>()

  const s3 = await getS3Config()
  const canStore = isS3Configured(s3)

  let deletedMessages = 0
  let deletedMailboxes = 0
  let storageHealthy = true
  let truncated = false

  while (Date.now() < deadline) {
    const batch = await db
      .select({ id: messages.id })
      .from(messages)
      .where(lt(messages.receivedAt, messageCutoff))
      .orderBy(messages.receivedAt)
      .limit(MESSAGE_BATCH)

    if (batch.length === 0) break

    const ids = batch.map((row) => row.id)
    const files = await db
      .select({ storageKey: attachments.storageKey })
      .from(attachments)
      .where(inArray(attachments.messageId, ids))
    const batchKeys = files
      .map((file) => file.storageKey)
      .filter((key): key is string => Boolean(key))

    if (canStore && batchKeys.length > 0) {
      try {
        await deleteObjectsStrict(batchKeys)
      } catch (error) {
        // Keep the rows: the next run can retry instead of leaking objects
        // that no longer have a database reference.
        console.error('[asms] cleanup storage delete failed', error)
        storageHealthy = false
        break
      }
    }

    const removed = await db
      .delete(messages)
      .where(inArray(messages.id, ids))
      .returning({ id: messages.id })
    for (const key of batchKeys) keys.add(key)
    deletedMessages += removed.length
    if (removed.length < MESSAGE_BATCH) break
  }
  if (Date.now() >= deadline) truncated = true

  while (storageHealthy && Date.now() < deadline) {
    const expired = await db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(
        and(
          eq(mailboxes.kind, 'temporary'),
          lte(mailboxes.expiresAt, now),
          // A mailbox that received mail during its validity window is kept.
          isNull(mailboxes.lastReceivedAt),
        ),
      )
      .limit(MAILBOX_BATCH)

    if (expired.length === 0) break

    const ids = expired.map((row) => row.id)
    const files = await db
      .select({ storageKey: attachments.storageKey })
      .from(attachments)
      .innerJoin(messages, eq(attachments.messageId, messages.id))
      .where(inArray(messages.mailboxId, ids))
    const batchKeys = files
      .map((file) => file.storageKey)
      .filter((key): key is string => Boolean(key))

    if (canStore && batchKeys.length > 0) {
      try {
        await deleteObjectsStrict(batchKeys)
      } catch (error) {
        console.error('[asms] cleanup storage delete failed', error)
        storageHealthy = false
        break
      }
    }

    const removed = await db
      .delete(mailboxes)
      .where(inArray(mailboxes.id, ids))
      .returning({ id: mailboxes.id })
    for (const key of batchKeys) keys.add(key)
    deletedMailboxes += removed.length
    if (removed.length < MAILBOX_BATCH) break
  }
  if (Date.now() >= deadline) truncated = true

  const releases = await db
    .delete(addressReleases)
    .where(lte(addressReleases.availableAt, now))
    .returning({ localPart: addressReleases.localPart })

  const staleIngest = new Date(now.getTime() - 30 * 86_400_000)
  const ingest = await db
    .delete(ingestEvents)
    .where(lt(ingestEvents.createdAt, staleIngest))
    .returning({ id: ingestEvents.id })

  const staleAudit = new Date(now.getTime() - 180 * 86_400_000)
  const audits = await db
    .delete(auditLogs)
    .where(lt(auditLogs.createdAt, staleAudit))
    .returning({ id: auditLogs.id })

  // Sent records carry the full body too; the retention window applies to
  // them as well. `queued` rows stay until a webhook or a retry resolves them.
  const staleQueued = new Date(now.getTime() - 7 * 86_400_000)
  const sent = await db
    .delete(sentEmails)
    .where(
      and(
        lt(sentEmails.createdAt, messageCutoff),
        or(
          ne(sentEmails.status, 'queued'),
          lt(sentEmails.createdAt, staleQueued),
        ),
      ),
    )
    .returning({ id: sentEmails.id })

  const sessions = await db
    .delete(session)
    .where(lt(session.expiresAt, now))
    .returning({ id: session.id })

  const verifications = await db
    .delete(verification)
    .where(lt(verification.expiresAt, now))
    .returning({ id: verification.id })

  const limits = await db
    .delete(rateLimits)
    .where(lt(rateLimits.expiresAt, now.getTime()))
    .returning({ key: rateLimits.key })

  // Quota rows are keyed by a calendar day and only ever read for today, so
  // everything before the window is dead weight that would grow by one row per
  // sender per day forever. `quotaDate` is zero-padded ISO, so a string
  // comparison is the same comparison as a date one.
  const staleQuota = new Date(now.getTime() - QUOTA_RETENTION_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const quota = await db
    .delete(sendQuota)
    .where(lt(sendQuota.quotaDate, staleQuota))
    .returning({ userId: sendQuota.userId })

  // Bulk deletes leave the query planner holding statistics for rows that no
  // longer exist. `PRAGMA optimize` re-analyses only the tables whose shape
  // actually moved, which is what keeps later reads picking the same indexes.
  try {
    await db.run(sql`PRAGMA optimize`)
  } catch (error) {
    console.warn('[asms] PRAGMA optimize failed', error)
  }

  return {
    messages: deletedMessages,
    mailboxes: deletedMailboxes,
    releases: releases.length,
    ingestEvents: ingest.length,
    auditLogs: audits.length,
    sentEmails: sent.length,
    sessions: sessions.length,
    verifications: verifications.length,
    rateLimits: limits.length,
    sendQuota: quota.length,
    objects: canStore ? keys.size : 0,
    truncated,
    ranAt: new Date().toISOString(),
  }
}
