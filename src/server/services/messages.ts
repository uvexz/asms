import { and, count, desc, eq, inArray } from 'drizzle-orm'

import { db } from '#/db'
import { attachments, domains, mailboxes, messages } from '#/db/schema'
import { deleteObjects } from '../integrations/storage'
import { RATE_LIMITS, enforceRateLimit } from '../rate-limit'
import { assert } from '../result'
import { formatAddress, isExpired } from './mailboxes'

export type MessageListItem = {
  id: string
  mailboxId: string
  mailboxAddress: string
  mailboxKind: 'permanent' | 'temporary'
  fromAddress: string
  fromName: string | null
  subject: string
  snippet: string
  isRead: boolean
  isStarred: boolean
  hasAttachments: boolean
  receivedAt: string
}

export type MessageDetail = MessageListItem & {
  to: string[]
  cc: string[]
  textBody: string | null
  htmlBody: string | null
  attachments: Array<{
    id: string
    filename: string
    contentType: string
    size: number
    stored: boolean
  }>
}

function parseList(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function assertMailboxUsable(row: typeof mailboxes.$inferSelect) {
  assert(row.status === 'active', 'MAILBOX_DISABLED', '邮箱已停用')
  assert(!isExpired(row), 'MAILBOX_EXPIRED', '临时邮箱已过期')
}

async function assertMailboxOwner(userId: string, mailboxId: string) {
  const row = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.userId, userId)))
    .get()
  assert(row, 'MAILBOX_NOT_FOUND', '邮箱不存在')
  assertMailboxUsable(row)
  return row
}

/**
 * The set of mailboxes a list request may read from. Expired temporary
 * mailboxes drop out here even before the cleanup cron removes their rows, so
 * an aggregate view never surfaces mail the user can no longer open.
 */
async function resolveMailboxScope(
  userId: string,
  mailboxId?: string,
): Promise<string[]> {
  if (mailboxId) {
    const row = await assertMailboxOwner(userId, mailboxId)
    assert(row.status === 'active', 'MAILBOX_DISABLED', '邮箱已停用')
    assert(!isExpired(row), 'MAILBOX_EXPIRED', '临时邮箱已过期')
    return [row.id]
  }

  const rows = await db
    .select({
      id: mailboxes.id,
      kind: mailboxes.kind,
      expiresAt: mailboxes.expiresAt,
      lastReceivedAt: mailboxes.lastReceivedAt,
    })
    .from(mailboxes)
    .where(and(eq(mailboxes.userId, userId), eq(mailboxes.status, 'active')))

  return rows.filter((row) => !isExpired(row)).map((row) => row.id)
}

export async function listMessages(input: {
  userId: string
  /** Omit to list messages across every active mailbox of the user. */
  mailboxId?: string
  page?: number
  pageSize?: number
  unreadOnly?: boolean
}) {
  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20))
  const offset = (page - 1) * pageSize

  const mailboxIds = await resolveMailboxScope(input.userId, input.mailboxId)
  if (mailboxIds.length === 0) {
    return { items: [], total: 0, page, pageSize, hasMore: false }
  }

  const scope =
    mailboxIds.length === 1
      ? eq(messages.mailboxId, mailboxIds[0])
      : inArray(messages.mailboxId, mailboxIds)
  const where = input.unreadOnly
    ? and(scope, eq(messages.isRead, false))
    : scope

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: messages.id,
        mailboxId: messages.mailboxId,
        fromAddress: messages.fromAddress,
        fromName: messages.fromName,
        subject: messages.subject,
        snippet: messages.snippet,
        isRead: messages.isRead,
        isStarred: messages.isStarred,
        hasAttachments: messages.hasAttachments,
        receivedAt: messages.receivedAt,
        localPart: mailboxes.localPart,
        domain: domains.name,
        kind: mailboxes.kind,
      })
      .from(messages)
      .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
      .innerJoin(domains, eq(mailboxes.domainId, domains.id))
      .where(where)
      .orderBy(desc(messages.receivedAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ value: count() }).from(messages).where(where).get(),
  ])

  const items: MessageListItem[] = rows.map((row) => ({
    id: row.id,
    mailboxId: row.mailboxId,
    mailboxAddress: formatAddress(row.localPart, row.domain),
    mailboxKind: row.kind === 'temporary' ? 'temporary' : 'permanent',
    fromAddress: row.fromAddress,
    fromName: row.fromName,
    subject: row.subject,
    snippet: row.snippet,
    isRead: row.isRead,
    isStarred: row.isStarred,
    hasAttachments: row.hasAttachments,
    receivedAt: row.receivedAt.toISOString(),
  }))

  return {
    items,
    total: totalRow?.value ?? 0,
    page,
    pageSize,
    hasMore: offset + items.length < (totalRow?.value ?? 0),
  }
}

export async function getMessage(
  userId: string,
  messageId: string,
): Promise<MessageDetail> {
  const row = await db
    .select({ message: messages, mailbox: mailboxes, domain: domains.name })
    .from(messages)
    .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
    .innerJoin(domains, eq(mailboxes.domainId, domains.id))
    .where(and(eq(messages.id, messageId), eq(mailboxes.userId, userId)))
    .get()

  assert(row, 'MESSAGE_NOT_FOUND', '邮件不存在')
  assert(
    row.mailbox.status === 'active' && !isExpired(row.mailbox),
    'MESSAGE_NOT_FOUND',
    '邮件不存在',
  )

  const files = await db
    .select()
    .from(attachments)
    .where(eq(attachments.messageId, messageId))

  return {
    id: row.message.id,
    mailboxId: row.message.mailboxId,
    mailboxAddress: formatAddress(row.mailbox.localPart, row.domain),
    mailboxKind: row.mailbox.kind === 'temporary' ? 'temporary' : 'permanent',
    fromAddress: row.message.fromAddress,
    fromName: row.message.fromName,
    subject: row.message.subject,
    snippet: row.message.snippet,
    isRead: row.message.isRead,
    isStarred: row.message.isStarred,
    hasAttachments: row.message.hasAttachments,
    receivedAt: row.message.receivedAt.toISOString(),
    to: parseList(row.message.toJson),
    cc: parseList(row.message.ccJson),
    // BCC is envelope data: returning it would tell every recipient who else
    // was hidden on the same message. It stays in the database for auditing
    // but is not part of the recipient-facing detail.
    textBody: row.message.textBody,
    htmlBody: row.message.htmlBody,
    attachments: files.map((file) => ({
      id: file.id,
      filename: file.filename,
      contentType: file.contentType,
      size: file.size,
      stored: file.stored,
    })),
  }
}

export async function markMessage(
  userId: string,
  messageId: string,
  patch: { isRead?: boolean; isStarred?: boolean },
) {
  await enforceRateLimit(RATE_LIMITS.messageMutate, userId)
  const row = await db
    .select({ id: messages.id, mailbox: mailboxes })
    .from(messages)
    .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
    .where(and(eq(messages.id, messageId), eq(mailboxes.userId, userId)))
    .get()
  assert(row, 'MESSAGE_NOT_FOUND', '邮件不存在')
  assertMailboxUsable(row.mailbox)

  await db.update(messages).set(patch).where(eq(messages.id, messageId))
}

export async function markAllRead(userId: string, mailboxId: string) {
  await enforceRateLimit(RATE_LIMITS.messageMutate, userId)
  await assertMailboxOwner(userId, mailboxId)
  await db
    .update(messages)
    .set({ isRead: true })
    .where(eq(messages.mailboxId, mailboxId))
}

export async function deleteMessage(userId: string, messageId: string) {
  await enforceRateLimit(RATE_LIMITS.messageMutate, userId)
  const row = await db
    .select({ id: messages.id, mailbox: mailboxes })
    .from(messages)
    .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
    .where(and(eq(messages.id, messageId), eq(mailboxes.userId, userId)))
    .get()
  assert(row, 'MESSAGE_NOT_FOUND', '邮件不存在')
  assertMailboxUsable(row.mailbox)

  const files = await db
    .select({ storageKey: attachments.storageKey })
    .from(attachments)
    .where(eq(attachments.messageId, messageId))

  await db.delete(messages).where(eq(messages.id, messageId))
  await deleteObjects(
    files
      .map((file) => file.storageKey)
      .filter((key): key is string => Boolean(key)),
  )
}

export async function getAttachmentForUser(
  userId: string,
  attachmentId: string,
) {
  const row = await db
    .select({ attachment: attachments, message: messages, mailbox: mailboxes })
    .from(attachments)
    .innerJoin(messages, eq(attachments.messageId, messages.id))
    .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
    .where(and(eq(attachments.id, attachmentId), eq(mailboxes.userId, userId)))
    .get()

  assert(row, 'ATTACHMENT_NOT_FOUND', '附件不存在')
  assertMailboxUsable(row.mailbox)
  return row
}
