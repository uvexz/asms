import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

import { db } from '#/db'
import { attachments, ingestEvents, mailboxes, messages } from '#/db/schema'
import { enqueueResend, getResend } from '../integrations/resend'
import {
  getS3Config,
  isS3Configured,
  uploadObject,
} from '../integrations/storage'
import {
  findMailboxByAddress,
  isExpired,
  splitAddress,
  stripPlusTag,
} from './mailboxes'

export type ResendReceivedEvent = {
  type: 'email.received'
  created_at?: string
  data: {
    email_id: string
    from: string
    to: string[]
    cc?: string[] | null
    bcc?: string[] | null
    subject?: string
    created_at?: string
  }
}

const MAX_BODY_BYTES = 1024 * 1024
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
const MAX_TOTAL_ATTACHMENT_BYTES = 30 * 1024 * 1024

function truncate(
  value: string | null | undefined,
  max: number,
): string | null {
  if (!value) return null
  return value.length > max ? value.slice(0, max) : value
}

function makeSnippet(text: string | null, html: string | null): string {
  const source =
    text ??
    html
      ?.replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ') ??
    ''
  return source.replace(/\s+/g, ' ').trim().slice(0, 180)
}

function parseFrom(value: string): { address: string; name: string | null } {
  const match = value.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/)
  if (match) {
    const name = match[1]?.trim()
    return { address: match[2].trim().toLowerCase(), name: name || null }
  }
  return { address: value.trim().toLowerCase(), name: null }
}

async function logIngest(input: {
  resendEmailId?: string
  recipients: string[]
  result: string
  detail?: string
  mailboxId?: string
}) {
  try {
    await db.insert(ingestEvents).values({
      id: randomUUID(),
      resendEmailId: input.resendEmailId ?? null,
      recipientsJson: JSON.stringify(input.recipients),
      result: input.result,
      detail: input.detail ?? null,
      mailboxId: input.mailboxId ?? null,
    })
  } catch (error) {
    console.error('[asms] ingest log failed', error)
  }
}

async function persistAttachments(input: {
  emailId: string
  messageId: string
  files: Array<{
    id: string
    filename: string | null
    size: number
    content_type: string
  }>
  canStore: boolean
}) {
  if (input.files.length === 0) return

  const resend = await getResend()
  let total = 0

  for (const file of input.files) {
    const attachmentId = randomUUID()
    const filename =
      file.filename || `attachment-${input.files.indexOf(file) + 1}`
    let stored = false
    let storageKey: string | null = null

    if (input.canStore && file.size <= MAX_ATTACHMENT_BYTES) {
      try {
        const detail = await enqueueResend(() =>
          resend.emails.receiving.attachments.get({
            emailId: input.emailId,
            id: file.id,
          }),
        )
        if (detail.data?.download_url) {
          const response = await fetch(detail.data.download_url)
          if (response.ok) {
            const buffer = new Uint8Array(await response.arrayBuffer())
            if (
              buffer.byteLength <= MAX_ATTACHMENT_BYTES &&
              total + buffer.byteLength <= MAX_TOTAL_ATTACHMENT_BYTES
            ) {
              const safeName = filename.replace(/[^\w.-]+/g, '_').slice(0, 80)
              storageKey = `attachments/${input.messageId}/${attachmentId}-${safeName}`
              await uploadObject(storageKey, buffer, file.content_type)
              stored = true
              total += buffer.byteLength
            }
          }
        }
      } catch (error) {
        console.error('[asms] attachment download failed', error)
      }
    }

    await db.insert(attachments).values({
      id: attachmentId,
      messageId: input.messageId,
      resendAttachmentId: file.id,
      filename,
      contentType: file.content_type || 'application/octet-stream',
      size: file.size,
      storageKey,
      stored,
    })
  }
}

export async function ingestReceivedEmail(
  event: ResendReceivedEvent,
): Promise<{ stored: number; skipped: number }> {
  const data = event.data
  const recipients = Array.from(
    new Set([...(data.to ?? []), ...(data.cc ?? []), ...(data.bcc ?? [])]),
  ).map((value) => value.trim().toLowerCase())

  if (recipients.length === 0) {
    await logIngest({
      resendEmailId: data.email_id,
      recipients: [],
      result: 'no_recipients',
    })
    return { stored: 0, skipped: 0 }
  }

  const matches: Array<{
    mailbox: typeof mailboxes.$inferSelect
    address: string
  }> = []

  for (const address of recipients) {
    const parsed = splitAddress(address)
    if (!parsed) continue
    const localPart = stripPlusTag(parsed.localPart)
    const mailbox = await findMailboxByAddress(localPart, parsed.domain)
    if (!mailbox) {
      await logIngest({
        resendEmailId: data.email_id,
        recipients: [address],
        result: 'no_mailbox',
      })
      continue
    }
    if (mailbox.status !== 'active') {
      await logIngest({
        resendEmailId: data.email_id,
        recipients: [address],
        result: 'mailbox_disabled',
        mailboxId: mailbox.id,
      })
      continue
    }
    if (isExpired(mailbox)) {
      await logIngest({
        resendEmailId: data.email_id,
        recipients: [address],
        result: 'mailbox_expired',
        mailboxId: mailbox.id,
      })
      continue
    }
    matches.push({ mailbox, address })
  }

  if (matches.length === 0) {
    return { stored: 0, skipped: recipients.length }
  }

  const resend = await getResend()
  const content = await enqueueResend(() =>
    resend.emails.receiving.get(data.email_id),
  )

  if (content.error || !content.data) {
    await logIngest({
      resendEmailId: data.email_id,
      recipients,
      result: 'content_fetch_failed',
      detail: content.error?.message,
    })
    throw new Error(content.error?.message ?? 'Failed to fetch received email')
  }

  const email = content.data
  const from = parseFrom(email.from || data.from)
  const s3Config = await getS3Config()
  const canStore = isS3Configured(s3Config)
  const receivedAt = new Date(
    email.created_at || data.created_at || event.created_at || Date.now(),
  )

  let stored = 0
  let skipped = 0

  for (const match of matches) {
    const duplicate = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.resendEmailId, data.email_id),
          eq(messages.mailboxId, match.mailbox.id),
        ),
      )
      .get()

    if (duplicate) {
      skipped += 1
      continue
    }

    const messageId = randomUUID()
    const textBody = truncate(email.text, MAX_BODY_BYTES)
    const htmlBody = truncate(email.html, MAX_BODY_BYTES)
    const headersJson = truncate(
      email.headers ? JSON.stringify(email.headers) : null,
      64 * 1024,
    )

    await db.insert(messages).values({
      id: messageId,
      mailboxId: match.mailbox.id,
      resendEmailId: data.email_id,
      fromAddress: from.address,
      fromName: from.name,
      toJson: JSON.stringify(email.to ?? data.to ?? []),
      ccJson: JSON.stringify(email.cc ?? data.cc ?? []),
      bccJson: JSON.stringify(email.bcc ?? data.bcc ?? []),
      replyToJson: JSON.stringify(email.reply_to ?? []),
      subject: email.subject || data.subject || '(无主题)',
      snippet: makeSnippet(textBody, htmlBody),
      textBody,
      htmlBody,
      headersJson,
      sizeBytes: (textBody?.length ?? 0) + (htmlBody?.length ?? 0),
      hasAttachments: (email.attachments?.length ?? 0) > 0,
      isRead: false,
      receivedAt,
    })

    await db
      .update(mailboxes)
      .set({ lastReceivedAt: receivedAt })
      .where(eq(mailboxes.id, match.mailbox.id))

    try {
      await persistAttachments({
        emailId: data.email_id,
        messageId,
        files: email.attachments ?? [],
        canStore,
      })
    } catch (error) {
      console.error('[asms] attachment persistence failed', error)
    }

    stored += 1
  }

  await logIngest({
    resendEmailId: data.email_id,
    recipients,
    result: stored > 0 ? 'stored' : 'duplicate',
    detail: `stored=${stored} skipped=${skipped}`,
  })

  return { stored, skipped }
}
