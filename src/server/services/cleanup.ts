import { and, eq, inArray, lt, lte } from 'drizzle-orm'

import { db } from '#/db'
import {
  addressReleases,
  attachments,
  auditLogs,
  ingestEvents,
  mailboxes,
  messages,
} from '#/db/schema'
import {
  deleteObject,
  getS3Config,
  isS3Configured,
} from '../integrations/storage'
import { getSetting } from '../settings'

const MESSAGE_BATCH = 500
const MAILBOX_BATCH = 200
const MAX_ROUNDS = 8

export async function runCleanup() {
  const now = new Date()
  const retentionDays = await getSetting('mail.retentionDays')
  const messageCutoff = new Date(now.getTime() - retentionDays * 86_400_000)
  const keys = new Set<string>()

  const s3 = await getS3Config()
  const canStore = isS3Configured(s3)

  let deletedMessages = 0
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const batch = await db
      .select({ id: messages.id })
      .from(messages)
      .where(lt(messages.receivedAt, messageCutoff))
      .limit(MESSAGE_BATCH)

    if (batch.length === 0) break

    const ids = batch.map((row) => row.id)
    const files = await db
      .select({ storageKey: attachments.storageKey })
      .from(attachments)
      .where(inArray(attachments.messageId, ids))
    for (const file of files) {
      if (file.storageKey) keys.add(file.storageKey)
    }

    const removed = await db
      .delete(messages)
      .where(inArray(messages.id, ids))
      .returning({ id: messages.id })
    deletedMessages += removed.length
    if (removed.length < MESSAGE_BATCH) break
  }

  let deletedMailboxes = 0
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const expired = await db
      .select({ id: mailboxes.id })
      .from(mailboxes)
      .where(
        and(eq(mailboxes.kind, 'temporary'), lte(mailboxes.expiresAt, now)),
      )
      .limit(MAILBOX_BATCH)

    if (expired.length === 0) break

    const ids = expired.map((row) => row.id)
    const files = await db
      .select({ storageKey: attachments.storageKey })
      .from(attachments)
      .innerJoin(messages, eq(attachments.messageId, messages.id))
      .where(inArray(messages.mailboxId, ids))
    for (const file of files) {
      if (file.storageKey) keys.add(file.storageKey)
    }

    const removed = await db
      .delete(mailboxes)
      .where(inArray(mailboxes.id, ids))
      .returning({ id: mailboxes.id })
    deletedMailboxes += removed.length
    if (removed.length < MAILBOX_BATCH) break
  }

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

  if (canStore && keys.size > 0) {
    for (const key of keys) {
      try {
        await deleteObject(key)
      } catch (error) {
        console.error('[asms] delete object failed', key, error)
      }
    }
  }

  return {
    messages: deletedMessages,
    mailboxes: deletedMailboxes,
    releases: releases.length,
    ingestEvents: ingest.length,
    auditLogs: audits.length,
    objects: canStore ? keys.size : 0,
    ranAt: new Date().toISOString(),
  }
}
