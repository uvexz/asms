import { and, count, desc, eq } from 'drizzle-orm'

import { db } from '#/db'
import { attachments, mailboxes, messages } from '#/db/schema'
import { deleteObjects } from '../integrations/storage'
import { assert } from '../result'

export type MessageListItem = {
  id: string
  mailboxId: string
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
  bcc: string[]
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

async function assertMailboxOwner(userId: string, mailboxId: string) {
  const row = await db
    .select()
    .from(mailboxes)
    .where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.userId, userId)))
    .get()
  assert(row, 'MAILBOX_NOT_FOUND', '邮箱不存在')
  return row
}

export async function listMessages(input: {
  userId: string
  mailboxId: string
  page?: number
  pageSize?: number
  unreadOnly?: boolean
}) {
  await assertMailboxOwner(input.userId, input.mailboxId)

  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20))
  const offset = (page - 1) * pageSize

  const where = input.unreadOnly
    ? and(eq(messages.mailboxId, input.mailboxId), eq(messages.isRead, false))
    : eq(messages.mailboxId, input.mailboxId)

  const [rows, totalRow] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(where)
      .orderBy(desc(messages.receivedAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ value: count() }).from(messages).where(where).get(),
  ])

  const items: MessageListItem[] = rows.map((row) => ({
    id: row.id,
    mailboxId: row.mailboxId,
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
    .select({ message: messages, mailbox: mailboxes })
    .from(messages)
    .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
    .where(and(eq(messages.id, messageId), eq(mailboxes.userId, userId)))
    .get()

  assert(row, 'MESSAGE_NOT_FOUND', '邮件不存在')

  const files = await db
    .select()
    .from(attachments)
    .where(eq(attachments.messageId, messageId))

  return {
    id: row.message.id,
    mailboxId: row.message.mailboxId,
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
    bcc: parseList(row.message.bccJson),
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
  const row = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
    .where(and(eq(messages.id, messageId), eq(mailboxes.userId, userId)))
    .get()
  assert(row, 'MESSAGE_NOT_FOUND', '邮件不存在')

  await db.update(messages).set(patch).where(eq(messages.id, messageId))
}

export async function markAllRead(userId: string, mailboxId: string) {
  await assertMailboxOwner(userId, mailboxId)
  await db
    .update(messages)
    .set({ isRead: true })
    .where(eq(messages.mailboxId, mailboxId))
}

export async function deleteMessage(userId: string, messageId: string) {
  const row = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(mailboxes, eq(messages.mailboxId, mailboxes.id))
    .where(and(eq(messages.id, messageId), eq(mailboxes.userId, userId)))
    .get()
  assert(row, 'MESSAGE_NOT_FOUND', '邮件不存在')

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
  return row
}
