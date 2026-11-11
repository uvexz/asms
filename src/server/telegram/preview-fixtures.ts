import { AppError } from '#/server/result'
import type { MailboxDto } from '#/server/services/mailboxes'
import type { MessageDetail, MessageListItem } from '#/server/services/messages'

import type { BotMailService } from './types'

export function makeMailbox(overrides: Partial<MailboxDto> = {}): MailboxDto {
  const localPart = overrides.localPart ?? 'hello'
  return {
    id: overrides.id ?? 'mb-1',
    address: overrides.address ?? `${localPart}@example.com`,
    localPart,
    domain: overrides.domain ?? 'example.com',
    domainId: overrides.domainId ?? 'domain-1',
    kind: overrides.kind ?? 'temporary',
    displayName: overrides.displayName ?? null,
    status: overrides.status ?? 'active',
    expiresAt:
      overrides.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString(),
    lastReceivedAt: overrides.lastReceivedAt ?? null,
    unread: overrides.unread ?? 0,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  }
}

export function makeMessage(
  overrides: Partial<MessageDetail> = {},
): MessageDetail {
  const mailboxId = overrides.mailboxId ?? 'mb-1'
  return {
    id: overrides.id ?? 'msg-1',
    mailboxId,
    mailboxAddress: overrides.mailboxAddress ?? 'hello@example.com',
    mailboxKind: overrides.mailboxKind ?? 'temporary',
    fromAddress: overrides.fromAddress ?? 'sender@example.com',
    fromName: overrides.fromName ?? 'Sender',
    subject: overrides.subject ?? 'Welcome',
    snippet: overrides.snippet ?? '',
    isRead: overrides.isRead ?? false,
    isStarred: overrides.isStarred ?? false,
    hasAttachments: overrides.hasAttachments ?? false,
    receivedAt: overrides.receivedAt ?? new Date().toISOString(),
    to: overrides.to ?? ['hello@example.com'],
    cc: overrides.cc ?? [],
    textBody:
      overrides.textBody ?? '第一段正文。\n\n第二段正文，用来验证分页。',
    htmlBody: overrides.htmlBody ?? null,
    attachments: overrides.attachments ?? [],
  }
}

export function toListItem(message: MessageDetail): MessageListItem {
  return {
    id: message.id,
    mailboxId: message.mailboxId,
    mailboxAddress: message.mailboxAddress,
    mailboxKind: message.mailboxKind,
    fromAddress: message.fromAddress,
    fromName: message.fromName,
    subject: message.subject,
    snippet: message.snippet,
    isRead: message.isRead,
    isStarred: message.isStarred,
    hasAttachments: message.hasAttachments,
    receivedAt: message.receivedAt,
  }
}

export class FakeMailService implements BotMailService {
  mailboxes: MailboxDto[] = []
  messages = new Map<string, MessageDetail>()
  private nextMailbox = 1

  async listMailboxes(): Promise<MailboxDto[]> {
    return this.mailboxes
  }

  async getMailbox(_userId: string, mailboxId: string): Promise<MailboxDto> {
    const mailbox = this.mailboxes.find((item) => item.id === mailboxId)
    if (!mailbox) {
      throw new AppError('MAILBOX_NOT_FOUND', '邮箱不存在')
    }
    return mailbox
  }

  async createTempMailbox(input: {
    userId: string
    role: string
    localPart: string
  }): Promise<MailboxDto> {
    if (this.mailboxes.some((item) => item.localPart === input.localPart)) {
      throw new AppError('ADDRESS_TAKEN', '该地址已被占用')
    }
    const mailbox = makeMailbox({
      id: `mb-${this.nextMailbox++}`,
      localPart: input.localPart,
      address: `${input.localPart}@example.com`,
      kind: 'temporary',
    })
    this.mailboxes.unshift(mailbox)
    return mailbox
  }

  async deleteTempMailbox(_userId: string, mailboxId: string): Promise<void> {
    const index = this.mailboxes.findIndex((item) => item.id === mailboxId)
    if (index < 0) {
      throw new AppError('MAILBOX_NOT_FOUND', '邮箱不存在')
    }
    if (this.mailboxes[index].kind !== 'temporary') {
      throw new AppError('MAILBOX_PERMANENT', '长期邮箱请在网页端删除')
    }
    this.mailboxes.splice(index, 1)
    for (const [id, message] of this.messages) {
      if (message.mailboxId === mailboxId) this.messages.delete(id)
    }
  }

  async listMessages(input: {
    userId: string
    mailboxId: string
    page: number
    pageSize: number
  }) {
    const all = [...this.messages.values()]
      .filter((message) => message.mailboxId === input.mailboxId)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
    const offset = (input.page - 1) * input.pageSize
    return {
      items: all.slice(offset, offset + input.pageSize).map(toListItem),
      total: all.length,
      hasMore: offset + input.pageSize < all.length,
    }
  }

  async getMessage(_userId: string, messageId: string): Promise<MessageDetail> {
    const message = this.messages.get(messageId)
    if (!message) {
      throw new AppError('MESSAGE_NOT_FOUND', '邮件不存在')
    }
    return message
  }

  async markRead(_userId: string, messageId: string): Promise<void> {
    const message = this.messages.get(messageId)
    if (!message) {
      throw new AppError('MESSAGE_NOT_FOUND', '邮件不存在')
    }
    this.messages.set(messageId, { ...message, isRead: true })
  }

  async deleteMessage(_userId: string, messageId: string): Promise<void> {
    if (!this.messages.has(messageId)) {
      throw new AppError('MESSAGE_NOT_FOUND', '邮件不存在')
    }
    this.messages.delete(messageId)
  }
}
