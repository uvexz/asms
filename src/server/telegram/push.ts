import type { MailboxDto } from '#/server/services/mailboxes'
import type { MessageDetail } from '#/server/services/messages'

import { defaultWidgetView } from './session'
import { buildChatData } from './state'
import type { TelegramSessionState, WidgetView } from './types'

export type NewMailWidget = {
  widget: WidgetView
  json: string
  bytes: number
}

/** Projects a freshly received message into the card that opens it. */
export function buildNewMailWidget(input: {
  state: TelegramSessionState
  message: MessageDetail
  mailbox: MailboxDto
  now: number
  timeZone: string
}): NewMailWidget {
  input.state.activeMailboxId = input.mailbox.id

  const widget = defaultWidgetView(input.now)
  widget.view = 'mail'
  widget.openId = input.message.id

  const built = buildChatData({
    state: input.state,
    widget,
    mailboxes: [input.mailbox],
    active: input.mailbox,
    inbox: null,
    inboxPage: 0,
    open: input.message,
    now: input.now,
    timeZone: input.timeZone,
    background: true,
  })

  return { widget, json: built.json, bytes: built.bytes }
}
