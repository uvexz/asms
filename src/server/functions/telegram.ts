import { createServerFn } from '@tanstack/react-start'

import { audit } from '#/server/services/audit'
import { AppError } from '#/server/result'
import { getTelegramLinkConfig } from '#/server/telegram/config'
import {
  getLinkForUser,
  issueLinkToken,
  unlinkForUser,
} from '#/server/telegram/links'
import { asUser } from '../session'

export const telegramLinkStatusFn = createServerFn({
  method: 'GET',
}).handler(async () =>
  asUser(async (ctx) => {
    const config = getTelegramLinkConfig()
    if (!config) {
      return {
        configured: false as const,
        botUsername: null,
        linked: null,
      }
    }
    const linked = await getLinkForUser(ctx.user.id)
    return {
      configured: true as const,
      botUsername: config.botUsername,
      linked,
    }
  }),
)

export const createTelegramLinkFn = createServerFn({
  method: 'POST',
}).handler(async () =>
  asUser(async (ctx) => {
    const config = getTelegramLinkConfig()
    if (!config) {
      throw new AppError('TELEGRAM_DISABLED', 'Telegram Bot 尚未配置')
    }
    const existing = await getLinkForUser(ctx.user.id)
    if (existing) {
      throw new AppError(
        'TELEGRAM_ALREADY_LINKED',
        '请先断开当前 Telegram 连接',
      )
    }

    const { token, expiresAt } = await issueLinkToken(ctx.user.id)
    await audit({
      actorId: ctx.user.id,
      action: 'telegram.link_token',
      targetType: 'telegram',
    })

    return {
      url: `https://t.me/${config.botUsername}?start=${encodeURIComponent(token)}`,
      expiresAt: expiresAt.toISOString(),
    }
  }),
)

export const unlinkTelegramFn = createServerFn({
  method: 'POST',
}).handler(async () =>
  asUser(async (ctx) => {
    const removed = await unlinkForUser(ctx.user.id)
    if (removed) {
      await audit({
        actorId: ctx.user.id,
        action: 'telegram.unlink',
        targetType: 'telegram',
        targetId: removed.telegramUserId,
      })
    }
    return { removed: Boolean(removed) }
  }),
)
