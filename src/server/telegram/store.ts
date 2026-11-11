import { and, eq, lt } from 'drizzle-orm'

import { db } from '#/db'
import { telegramSessions, telegramUpdates } from '#/db/schema'

import {
  defaultSessionState,
  parseSessionState,
  serializeSessionState,
} from './session'
import type { TelegramSessionState } from './types'

export type LoadedSession = {
  telegramUserId: string
  chatId: string
  activeMessageId: number | null
  state: TelegramSessionState
  /** -1 means no row yet; save inserts. */
  version: number
}

export async function loadSession(
  telegramUserId: string,
  chatId: string,
): Promise<LoadedSession> {
  const row = await db
    .select()
    .from(telegramSessions)
    .where(eq(telegramSessions.telegramUserId, telegramUserId))
    .get()

  if (!row) {
    return {
      telegramUserId,
      chatId,
      activeMessageId: null,
      state: defaultSessionState(),
      version: -1,
    }
  }

  return {
    telegramUserId,
    chatId,
    activeMessageId: row.activeMessageId ?? null,
    state: parseSessionState(row.stateJson) ?? defaultSessionState(),
    version: row.version,
  }
}

/**
 * Optimistic write. Returns the new version, or null when another instance
 * won the race; callers reload and reapply their in-memory mutations.
 */
export async function saveSession(input: {
  telegramUserId: string
  chatId: string
  activeMessageId: number | null
  state: TelegramSessionState
  expectedVersion: number
}): Promise<number | null> {
  const stateJson = serializeSessionState(input.state)
  const now = new Date()

  if (input.expectedVersion < 0) {
    try {
      const result = await db.insert(telegramSessions).values({
        telegramUserId: input.telegramUserId,
        chatId: input.chatId,
        activeMessageId: input.activeMessageId,
        stateJson,
        version: 1,
        updatedAt: now,
      })
      return result.rowsAffected > 0 ? 1 : null
    } catch {
      return null
    }
  }

  const result = await db
    .update(telegramSessions)
    .set({
      chatId: input.chatId,
      activeMessageId: input.activeMessageId,
      stateJson,
      version: input.expectedVersion + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(telegramSessions.telegramUserId, input.telegramUserId),
        eq(telegramSessions.version, input.expectedVersion),
      ),
    )

  return result.rowsAffected > 0 ? input.expectedVersion + 1 : null
}

/** Best-effort update of the server-side copy of the last state the widget
 * received. A conflict is safe: the next action simply edits again. */
export async function saveLastChatData(input: {
  telegramUserId: string
  messageId: number
  chatData: string
}): Promise<void> {
  const row = await db
    .select()
    .from(telegramSessions)
    .where(eq(telegramSessions.telegramUserId, input.telegramUserId))
    .get()
  if (!row) return

  const state = parseSessionState(row.stateJson)
  if (!state) return
  const widget = state.widgets[String(input.messageId)]
  if (!widget) return
  widget.lastChatData = input.chatData

  await db
    .update(telegramSessions)
    .set({
      stateJson: serializeSessionState(state),
      version: row.version + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(telegramSessions.telegramUserId, input.telegramUserId),
        eq(telegramSessions.version, row.version),
      ),
    )
}

export async function deleteSession(telegramUserId: string): Promise<void> {
  await db
    .delete(telegramSessions)
    .where(eq(telegramSessions.telegramUserId, telegramUserId))
}

export async function claimUpdate(
  updateId: number,
  now = Date.now(),
): Promise<boolean> {
  const claimedAt = new Date(now)
  const inserted = await db
    .insert(telegramUpdates)
    .values({ updateId, status: 'processing', claimedAt })
    .onConflictDoNothing()
  if (inserted.rowsAffected > 0) return true

  const row = await db
    .select()
    .from(telegramUpdates)
    .where(eq(telegramUpdates.updateId, updateId))
    .get()
  if (!row || row.status === 'done') return false
  if (row.claimedAt.getTime() > now - 2 * 60_000) return false

  const takeover = await db
    .update(telegramUpdates)
    .set({ status: 'processing', claimedAt })
    .where(
      and(
        eq(telegramUpdates.updateId, updateId),
        eq(telegramUpdates.status, 'processing'),
        lt(telegramUpdates.claimedAt, new Date(now - 2 * 60_000)),
      ),
    )
  return takeover.rowsAffected > 0
}

export async function completeUpdate(updateId: number): Promise<void> {
  await db
    .update(telegramUpdates)
    .set({ status: 'done' })
    .where(eq(telegramUpdates.updateId, updateId))
}

export async function releaseUpdate(updateId: number): Promise<void> {
  await db
    .delete(telegramUpdates)
    .where(
      and(
        eq(telegramUpdates.updateId, updateId),
        eq(telegramUpdates.status, 'processing'),
      ),
    )
}

/** Housekeeping for the update idempotency table. */
export async function pruneUpdates(
  olderThan = new Date(Date.now() - 24 * 60 * 60_000),
): Promise<void> {
  await db
    .delete(telegramUpdates)
    .where(lt(telegramUpdates.claimedAt, olderThan))
}
