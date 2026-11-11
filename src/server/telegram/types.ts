import type { MailboxDto } from '#/server/services/mailboxes'
import type { MessageDetail, MessageListItem } from '#/server/services/messages'

export type TelegramUser = {
  id: number
  is_bot?: boolean
  first_name: string
  last_name?: string
  username?: string
}

export type TelegramChat = {
  id: number
  type: string
  first_name?: string
  username?: string
}

export type TelegramMessage = {
  message_id: number
  from?: TelegramUser
  chat: TelegramChat
  text?: string
}

export type TelegramWidgetQuery = {
  id: string
  from: TelegramUser
  chat?: TelegramChat
  message_id?: number
  inline_message_id?: string
  chat_instance?: string
  chat_type?: string
  data: string
  widget_id?: string
}

export type TelegramUpdate = {
  update_id: number
  message?: TelegramMessage
  widget_query?: TelegramWidgetQuery
}

export type TelegramConfig = {
  token: string
  webhookSecret: string
  botUsername: string | null
  baseUrl: string
  widgetHeight: number
  bodyPageChars: number
  bodyPageBytes: number
}

export type LinkRecord = {
  telegramUserId: string
  userId: string
  role: string
  banned: boolean
  username: string | null
  firstName: string | null
}

export type WidgetView = {
  view: 'home' | 'mail'
  page: number
  mailboxPage: number
  openId: string | null
  error: string
  seq: number
  /** Last chat_data successfully sent/edited; server-side only. */
  lastChatData: string | null
  updatedAt: number
}

export type SessionRef = {
  id: string
  k: 'mailbox' | 'message'
  t: number
}

export type TelegramSessionState = {
  v: 1
  activeMailboxId: string | null
  refs: { next: number; items: Record<string, SessionRef> }
  widgets: Record<string, WidgetView>
}

export type ChatDataHome = {
  v: 1
  s: number
  m: string | null
  a: string | null
  k: 0 | 1
  w: 0
  p: number
  z: number
  lp: number
  lz: number
  l: Array<[string, string, number]>
  i: Array<[string, string, string, string, 0 | 1]>
  e: string
  b: 0 | 1
}

export type ChatDataMail = {
  v: 1
  s: number
  m: string | null
  a: string | null
  k: 0 | 1
  w: 1
  o: [string, string, string, string, 0 | 1]
  e: string
  b: 0 | 1
}

export type ChatData = ChatDataHome | ChatDataMail

export type ListMessagesResult = {
  items: MessageListItem[]
  total: number
  hasMore: boolean
}

export type BotMailService = {
  listMailboxes: (userId: string) => Promise<MailboxDto[]>
  getMailbox: (userId: string, mailboxId: string) => Promise<MailboxDto>
  createTempMailbox: (input: {
    userId: string
    role: string
    localPart: string
  }) => Promise<MailboxDto>
  deleteTempMailbox: (userId: string, mailboxId: string) => Promise<void>
  listMessages: (input: {
    userId: string
    mailboxId: string
    page: number
    pageSize: number
  }) => Promise<ListMessagesResult>
  getMessage: (userId: string, messageId: string) => Promise<MessageDetail>
  markRead: (userId: string, messageId: string) => Promise<void>
  deleteMessage: (userId: string, messageId: string) => Promise<void>
}

export type WidgetAction =
  | { kind: 'create' }
  | { kind: 'switch'; ref: string }
  | { kind: 'refresh' }
  | { kind: 'page'; page: number }
  | { kind: 'mailboxPage'; page: number }
  | { kind: 'read'; ref: string }
  | { kind: 'body'; ref: string; page: number }
  | { kind: 'back' }
  | { kind: 'deleteMailbox'; ref: string }
  | { kind: 'deleteMessage'; ref: string }

export type BodyPage = {
  page: number
  total: number
  chunk: string
}

export type ActionResult = {
  answer: 'ok' | 'body'
  body?: BodyPage
  mailboxes?: MailboxDto[]
  active?: MailboxDto | null
  open?: MessageDetail | null
}
