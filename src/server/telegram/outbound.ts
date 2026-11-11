import type { TelegramApi } from './api'
import { ensureWidget } from './session'
import type { LoadedSession } from './store'
import { loadSession, saveSession } from './store'
import type { TelegramSessionState, WidgetView } from './types'
import { assertWidgetHtml } from './widget'

export async function sendWidgetAndStore(input: {
  api: TelegramApi
  widgetHtml: string
  loaded: LoadedSession
  chatId: number
  widget: WidgetView
  json: string
}): Promise<void> {
  const { loaded, widget, json } = input

  assertWidgetHtml(input.widgetHtml)
  const sent = await input.api.sendWidget({
    chat_id: input.chatId,
    html: input.widgetHtml,
    chat_data: json,
    allow_queries: true,
  })

  const messageId = sent.message_id
  const stored = ensureWidget(loaded.state, messageId, Date.now())
  Object.assign(stored, widget)
  stored.lastChatData = json
  stored.updatedAt = Date.now()
  loaded.activeMessageId = messageId

  let current = loaded
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const version = await saveSession({
      telegramUserId: current.telegramUserId,
      chatId: String(input.chatId),
      activeMessageId: messageId,
      state: current.state,
      expectedVersion: current.version,
    })
    if (version !== null) return

    const fresh = await loadSession(
      current.telegramUserId,
      String(input.chatId),
    )
    mergeRefs(fresh.state, current.state)
    const freshWidget = ensureWidget(fresh.state, messageId, Date.now())
    Object.assign(
      freshWidget,
      current.state.widgets[String(messageId)] ?? widget,
    )
    freshWidget.lastChatData = json
    fresh.state.activeMailboxId = current.state.activeMailboxId
    fresh.activeMessageId = messageId
    current = fresh
  }
  console.error('[asms] telegram new widget session could not be persisted')
}

function mergeRefs(target: TelegramSessionState, source: TelegramSessionState) {
  for (const [ref, item] of Object.entries(source.refs.items)) {
    if (!target.refs.items[ref]) {
      target.refs.items[ref] = { ...item }
    }
  }
  target.refs.next = Math.max(target.refs.next, source.refs.next)
}
