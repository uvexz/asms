import { and, count, desc, eq, notInArray } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

import { db } from '#/db'
import { domains, sentEmails } from '#/db/schema'
import { enqueueResend, getResend } from '../integrations/resend'
import { AppError, assert } from '../result'
import { getMailPolicy, getSetting } from '../settings'
import { getMailboxForUser, sanitizeDisplayName } from './mailboxes'
import { releaseSendQuota, reserveSendQuota } from './quota'

const MAX_RECIPIENTS = 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function assertRecipients(list: string[], label: string) {
  assert(
    list.length <= MAX_RECIPIENTS,
    'TOO_MANY_RECIPIENTS',
    `${label}最多 ${MAX_RECIPIENTS} 个`,
  )
  for (const address of list) {
    assert(
      EMAIL_RE.test(address),
      'INVALID_RECIPIENT',
      `收件地址不合法：${address}`,
    )
  }
}

function textToHtml(text: string) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return `<div style="white-space:pre-wrap;font-family:ui-sans-serif,system-ui,sans-serif">${escaped}</div>`
}

export type SentEmailDto = {
  id: string
  fromAddress: string
  to: string[]
  subject: string
  status: string
  errorMessage: string | null
  createdAt: string
  sentAt: string | null
}

type SentEmailSummary = {
  id: string
  fromAddress: string
  toJson: string
  subject: string
  status: string
  errorMessage: string | null
  createdAt: Date
  sentAt: Date | null
}

function serializeSent(row: SentEmailSummary): SentEmailDto {
  let to: string[] = []
  try {
    const parsed = JSON.parse(row.toJson)
    if (Array.isArray(parsed)) to = parsed.map(String)
  } catch {
    to = []
  }

  return {
    id: row.id,
    fromAddress: row.fromAddress,
    to,
    subject: row.subject,
    status: row.status,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
  }
}

export async function sendMail(input: {
  userId: string
  role: string
  mailboxId: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text: string
  requestId: string
}): Promise<SentEmailDto> {
  const { row: mailbox, mailbox: dto } = await getMailboxForUser(
    input.userId,
    input.mailboxId,
  )
  const policy = await getMailPolicy()

  if (mailbox.kind === 'temporary' && !policy.allowTempSending) {
    throw new AppError('TEMP_SEND_DISABLED', '临时邮箱仅支持收件')
  }

  const domain = await db
    .select()
    .from(domains)
    .where(eq(domains.id, mailbox.domainId))
    .get()

  assert(domain, 'DOMAIN_NOT_FOUND', '域名不存在')
  assert(
    domain.status === 'verified' && domain.sendingEnabled,
    'DOMAIN_SEND_DISABLED',
    '该域名当前不可发件',
  )

  const to = input.to.map((value) => value.trim().toLowerCase()).filter(Boolean)
  const cc = (input.cc ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  const bcc = (input.bcc ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)

  assert(to.length > 0, 'NO_RECIPIENT', '请填写收件人')
  assertRecipients(to, '收件人')
  assertRecipients(cc, '抄送')
  assertRecipients(bcc, '密送')

  const subject = input.subject.trim()
  assert(subject.length > 0, 'EMPTY_SUBJECT', '请填写主题')
  assert(subject.length <= 200, 'SUBJECT_TOO_LONG', '主题最多 200 字')

  const text = input.text.trim()
  assert(text.length > 0, 'EMPTY_BODY', '请填写正文')
  assert(text.length <= 100_000, 'BODY_TOO_LONG', '正文过长')

  const idempotencyKey = `asms/${input.userId}/${input.requestId}`
  const existing = await db
    .select()
    .from(sentEmails)
    .where(eq(sentEmails.idempotencyKey, idempotencyKey))
    .get()
  if (existing) {
    if (existing.status === 'failed') {
      throw new AppError(
        'SEND_FAILED',
        existing.errorMessage ?? '上次发送失败，请重试',
      )
    }
    return serializeSent(existing)
  }

  const [timeZone, fromName] = await Promise.all([
    getSetting('site.timezone'),
    getSetting('resend.fromName'),
  ])

  await reserveSendQuota({
    userId: input.userId,
    role: input.role,
    limit: policy.dailySendLimit,
    timeZone,
  })

  const rowId = randomUUID()
  const now = new Date()
  const displayName =
    sanitizeDisplayName(mailbox.displayName) || sanitizeDisplayName(fromName)
  const fromAddress = displayName
    ? `${displayName} <${dto.address}>`
    : dto.address

  let inserted: Array<{ id: string }>
  try {
    inserted = await db
      .insert(sentEmails)
      .values({
        id: rowId,
        userId: input.userId,
        mailboxId: mailbox.id,
        idempotencyKey,
        fromAddress: dto.address,
        toJson: JSON.stringify(to),
        ccJson: JSON.stringify(cc),
        bccJson: JSON.stringify(bcc),
        subject,
        textBody: text,
        htmlBody: textToHtml(text),
        status: 'queued',
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: sentEmails.id })
  } catch (error) {
    await releaseSendQuota(input.userId, timeZone)
    throw error
  }

  if (inserted.length === 0) {
    // Another request with the same idempotency key won the insert. Give its
    // quota reservation back and return the row it created.
    await releaseSendQuota(input.userId, timeZone)
    const winner = await db
      .select()
      .from(sentEmails)
      .where(eq(sentEmails.idempotencyKey, idempotencyKey))
      .get()
    if (winner) return serializeSent(winner)
    throw new AppError('SEND_FAILED', '发送请求冲突，请重试')
  }

  try {
    const resend = await getResend()
    const result = await enqueueResend(() =>
      resend.emails.send(
        {
          from: fromAddress,
          to,
          ...(cc.length > 0 ? { cc } : {}),
          ...(bcc.length > 0 ? { bcc } : {}),
          subject,
          text,
          html: textToHtml(text),
          replyTo: dto.address,
        },
        { idempotencyKey },
      ),
    )

    if (result.error || !result.data) {
      throw new AppError(
        'SEND_FAILED',
        result.error?.message ?? 'Resend 拒绝了本次发送',
      )
    }

    await db
      .update(sentEmails)
      .set({
        resendEmailId: result.data.id,
        status: 'sent',
        sentAt: new Date(),
        lastEventAt: new Date(),
        errorCode: null,
        errorMessage: null,
      })
      .where(eq(sentEmails.id, rowId))

    return serializeSent({
      id: rowId,
      fromAddress: dto.address,
      toJson: JSON.stringify(to),
      subject,
      status: 'sent',
      errorMessage: null,
      createdAt: now,
      sentAt: new Date(),
    })
  } catch (error) {
    await Promise.all([
      releaseSendQuota(input.userId, timeZone),
      db
        .update(sentEmails)
        .set({
          status: 'failed',
          errorCode: error instanceof AppError ? error.code : 'SEND_FAILED',
          errorMessage: error instanceof Error ? error.message : '发送失败',
          lastEventAt: new Date(),
        })
        .where(eq(sentEmails.id, rowId)),
    ])
    throw error
  }
}

export async function listSentEmails(input: {
  userId: string
  page?: number
  pageSize?: number
}) {
  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20))
  const offset = (page - 1) * pageSize
  const where = eq(sentEmails.userId, input.userId)

  const [rows, totalRow] = await Promise.all([
    db
      .select({
        id: sentEmails.id,
        fromAddress: sentEmails.fromAddress,
        toJson: sentEmails.toJson,
        subject: sentEmails.subject,
        status: sentEmails.status,
        errorMessage: sentEmails.errorMessage,
        createdAt: sentEmails.createdAt,
        sentAt: sentEmails.sentAt,
      })
      .from(sentEmails)
      .where(where)
      .orderBy(desc(sentEmails.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ value: count() }).from(sentEmails).where(where).get(),
  ])

  return {
    items: rows.map(serializeSent),
    total: totalRow?.value ?? 0,
    page,
    pageSize,
  }
}

export async function getSentEmail(userId: string, id: string) {
  const row = await db
    .select()
    .from(sentEmails)
    .where(and(eq(sentEmails.id, id), eq(sentEmails.userId, userId)))
    .get()
  assert(row, 'SENT_NOT_FOUND', '记录不存在')

  let cc: string[] = []
  let bcc: string[] = []
  try {
    cc = JSON.parse(row.ccJson)
    bcc = JSON.parse(row.bccJson)
  } catch {
    // keep empty
  }

  return {
    ...serializeSent(row),
    cc,
    bcc,
    textBody: row.textBody,
    htmlBody: row.htmlBody,
    errorCode: row.errorCode,
  }
}

export async function updateSentStatusByResendId(
  resendEmailId: string,
  status: string,
) {
  const conditions = [eq(sentEmails.resendEmailId, resendEmailId)]
  // Webhooks can arrive out of order. Never move a delivered/bounced message
  // back to `sent`, and never overwrite a hard failure with a soft event.
  if (status === 'sent' || status === 'delivery_delayed') {
    conditions.push(
      notInArray(sentEmails.status, [
        'delivered',
        'bounced',
        'complained',
        'failed',
      ]),
    )
  } else if (status === 'delivered') {
    conditions.push(
      notInArray(sentEmails.status, ['bounced', 'complained', 'failed']),
    )
  }

  await db
    .update(sentEmails)
    .set({ status, lastEventAt: new Date() })
    .where(and(...conditions))
}
