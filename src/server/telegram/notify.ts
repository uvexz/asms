import { getSetting } from '#/server/settings'

import { TelegramApi } from './api'
import { getTelegramConfig } from './config'
import { getLinkForUser } from './links'
import { realMailService } from './mail-service'
import { sendWidgetAndStore } from './outbound'
import { buildNewMailWidget } from './push'
import { loadSession } from './store'
import widgetHtml from './widget.html?raw'

/**
 * Pushes a widget card that opens a newly received message. Best effort:
 * ingest must never fail because Telegram is unlinked or unreachable.
 */
export async function notifyTelegramNewMail(input: {
  userId: string
  messageId: string
  mailboxId: string
}): Promise<void> {
  try {
    const config = getTelegramConfig()
    if (!config) return

    const link = await getLinkForUser(input.userId)
    if (!link || link.banned) return

    const [timeZone, message, mailbox] = await Promise.all([
      getSetting('site.timezone').catch(() => 'Asia/Shanghai'),
      realMailService.getMessage(input.userId, input.messageId),
      realMailService.getMailbox(input.userId, input.mailboxId),
    ])
    if (message.mailboxId !== mailbox.id) return

    // Telegram private chats use the user id as the chat id.
    const chatId = Number(link.telegramUserId)
    const loaded = await loadSession(link.telegramUserId, String(chatId))
    const built = buildNewMailWidget({
      state: loaded.state,
      message,
      mailbox,
      now: Date.now(),
      timeZone,
    })

    await sendWidgetAndStore({
      api: new TelegramApi(config),
      widgetHtml,
      loaded,
      chatId,
      widget: built.widget,
      json: built.json,
    })
  } catch (error) {
    console.error(
      '[asms] telegram new mail push failed',
      error instanceof Error ? error.message : error,
    )
  }
}
