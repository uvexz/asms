import { and, eq, gt, isNull, ne } from 'drizzle-orm'

import { db } from '#/db'
import {
  telegramLinkTokens,
  telegramLinks,
  telegramSessions,
  user,
} from '#/db/schema'

import { createLinkToken, LINK_TOKEN_TTL_MS } from './link-token'
import type { LinkRecord, TelegramUser } from './types'

export type ConsumeResult =
  | { ok: true; userId: string }
  | {
      ok: false
      reason: 'expired' | 'banned' | 'linked_elsewhere'
    }

export async function getLink(
  telegramUserId: string,
): Promise<LinkRecord | null> {
  const row = await db
    .select({
      link: telegramLinks,
      role: user.role,
      banned: user.banned,
    })
    .from(telegramLinks)
    .innerJoin(user, eq(telegramLinks.userId, user.id))
    .where(eq(telegramLinks.telegramUserId, telegramUserId))
    .get()

  if (!row) return null
  return {
    telegramUserId: row.link.telegramUserId,
    userId: row.link.userId,
    role: row.role,
    banned: Boolean(row.banned),
    username: row.link.telegramUsername,
    firstName: row.link.telegramFirstName,
  }
}

export async function getLinkForUser(userId: string) {
  const row = await db
    .select({ link: telegramLinks, banned: user.banned })
    .from(telegramLinks)
    .innerJoin(user, eq(telegramLinks.userId, user.id))
    .where(eq(telegramLinks.userId, userId))
    .get()
  if (!row) return null
  return {
    telegramUserId: row.link.telegramUserId,
    username: row.link.telegramUsername,
    firstName: row.link.telegramFirstName,
    linkedAt: row.link.linkedAt.toISOString(),
    banned: Boolean(row.banned),
  }
}

export async function issueLinkToken(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const { token, hash } = createLinkToken()
  const expiresAt = new Date(Date.now() + LINK_TOKEN_TTL_MS)

  await db
    .delete(telegramLinkTokens)
    .where(
      and(
        eq(telegramLinkTokens.userId, userId),
        isNull(telegramLinkTokens.usedAt),
      ),
    )
  await db.insert(telegramLinkTokens).values({
    tokenHash: hash,
    userId,
    expiresAt,
  })

  return { token, expiresAt }
}

/**
 * Consumes a one-time deep-link token and binds the Telegram user to its asms
 * account. One Telegram per account and one account per Telegram; a token for
 * a different account is rejected without being burned.
 */
export async function consumeLinkToken(input: {
  tokenHash: string
  telegramUser: TelegramUser
  now?: number
}): Promise<ConsumeResult> {
  const now = input.now ?? Date.now()
  const nowDate = new Date(now)
  const telegramUserId = String(input.telegramUser.id)

  return db.transaction(async (tx): Promise<ConsumeResult> => {
    const token = await tx
      .select()
      .from(telegramLinkTokens)
      .where(
        and(
          eq(telegramLinkTokens.tokenHash, input.tokenHash),
          isNull(telegramLinkTokens.usedAt),
          gt(telegramLinkTokens.expiresAt, nowDate),
        ),
      )
      .get()
    if (!token) return { ok: false, reason: 'expired' }

    const target = await tx
      .select({ id: user.id, banned: user.banned })
      .from(user)
      .where(eq(user.id, token.userId))
      .get()
    if (!target) return { ok: false, reason: 'expired' }
    if (target.banned) return { ok: false, reason: 'banned' }

    const existing = await tx
      .select()
      .from(telegramLinks)
      .where(eq(telegramLinks.telegramUserId, telegramUserId))
      .get()
    if (existing && existing.userId !== token.userId) {
      return { ok: false, reason: 'linked_elsewhere' }
    }

    // The account is switching to a different Telegram account.
    const other = await tx
      .select()
      .from(telegramLinks)
      .where(
        and(
          eq(telegramLinks.userId, token.userId),
          ne(telegramLinks.telegramUserId, telegramUserId),
        ),
      )
      .get()
    if (other) {
      await tx
        .delete(telegramSessions)
        .where(eq(telegramSessions.telegramUserId, other.telegramUserId))
      await tx
        .delete(telegramLinks)
        .where(eq(telegramLinks.telegramUserId, other.telegramUserId))
    }

    await tx
      .insert(telegramLinks)
      .values({
        telegramUserId,
        userId: token.userId,
        telegramUsername: input.telegramUser.username ?? null,
        telegramFirstName: input.telegramUser.first_name ?? null,
        lastSeenAt: nowDate,
      })
      .onConflictDoUpdate({
        target: telegramLinks.telegramUserId,
        set: {
          userId: token.userId,
          telegramUsername: input.telegramUser.username ?? null,
          telegramFirstName: input.telegramUser.first_name ?? null,
          lastSeenAt: nowDate,
        },
      })

    const claimed = await tx
      .update(telegramLinkTokens)
      .set({ usedAt: nowDate })
      .where(
        and(
          eq(telegramLinkTokens.tokenHash, input.tokenHash),
          isNull(telegramLinkTokens.usedAt),
        ),
      )
    if (claimed.rowsAffected === 0) {
      return { ok: false, reason: 'expired' }
    }

    return { ok: true, userId: token.userId }
  })
}

export async function touchLink(
  telegramUserId: string,
  telegramUser: TelegramUser,
): Promise<void> {
  await db
    .update(telegramLinks)
    .set({
      telegramUsername: telegramUser.username ?? null,
      telegramFirstName: telegramUser.first_name ?? null,
      lastSeenAt: new Date(),
    })
    .where(eq(telegramLinks.telegramUserId, telegramUserId))
}

export async function unlinkForUser(
  userId: string,
): Promise<{ telegramUserId: string } | null> {
  const link = await db
    .select()
    .from(telegramLinks)
    .where(eq(telegramLinks.userId, userId))
    .get()
  if (!link) return null

  await db.transaction(async (tx) => {
    await tx
      .delete(telegramSessions)
      .where(eq(telegramSessions.telegramUserId, link.telegramUserId))
    await tx.delete(telegramLinks).where(eq(telegramLinks.userId, userId))
    await tx
      .delete(telegramLinkTokens)
      .where(eq(telegramLinkTokens.userId, userId))
  })

  return { telegramUserId: link.telegramUserId }
}
