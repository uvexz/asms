import { AppError } from '#/server/result'
import {
  createMailbox,
  deleteMailbox as deleteMailboxService,
  getMailboxForUser,
  listMailboxes as listMailboxesService,
} from '#/server/services/mailboxes'
import {
  deleteMessage as deleteMessageService,
  getMessage as getMessageService,
  listMessages as listMessagesService,
  markMessage,
} from '#/server/services/messages'

import type { BotMailService } from './types'

/**
 * Production mail adapter. All reads and writes go through the same services
 * the web app uses, so ownership, quotas, expiry, unread counts, attachment
 * cleanup and Resend-ingested mail stay authoritative in one place.
 */
export const realMailService: BotMailService = {
  async listMailboxes(userId) {
    return listMailboxesService(userId)
  },

  async getMailbox(userId, mailboxId) {
    return (await getMailboxForUser(userId, mailboxId)).mailbox
  },

  async createTempMailbox({ userId, role, localPart }) {
    return createMailbox({
      userId,
      role,
      localPart,
      kind: 'temporary',
    })
  },

  async deleteTempMailbox(userId, mailboxId) {
    const { mailbox } = await getMailboxForUser(userId, mailboxId)
    if (mailbox.kind !== 'temporary') {
      throw new AppError('MAILBOX_PERMANENT', '长期邮箱请在网页端删除')
    }
    await deleteMailboxService(userId, mailboxId)
  },

  async listMessages({ userId, mailboxId, page, pageSize }) {
    const result = await listMessagesService({
      userId,
      mailboxId,
      page,
      pageSize,
    })
    return {
      items: result.items,
      total: result.total,
      hasMore: result.hasMore,
    }
  },

  getMessage(userId, messageId) {
    return getMessageService(userId, messageId)
  },

  markRead(userId, messageId) {
    return markMessage(userId, messageId, { isRead: true })
  },

  deleteMessage(userId, messageId) {
    return deleteMessageService(userId, messageId)
  },
}
