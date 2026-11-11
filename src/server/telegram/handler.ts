import { randomTempLocalPart } from '#/lib/temp-address'
import { AppError } from '#/server/result'
import { audit } from '#/server/services/audit'
import type { MailboxDto } from '#/server/services/mailboxes'
import type { MessageDetail, MessageListItem } from '#/server/services/messages'
import { getMailPolicy, getSetting } from '#/server/settings'

import { applyAction, parseAction } from './actions'
import { TelegramApi, TelegramApiError } from './api'
import { getTelegramConfig } from './config'
import { hashLinkToken, isLinkToken } from './link-token'
import { consumeLinkToken, getLink, touchLink } from './links'
import { realMailService } from './mail-service'
import { defaultWidgetView, ensureWidget } from './session'
import {
  buildChatData,
  clamp,
  INBOX_PAGE_SIZE,
  MAILBOX_PAGE_SIZE,
} from './state'
import type { LoadedSession } from './store'
import { loadSession, saveLastChatData, saveSession } from './store'
import type {
  ActionResult,
  BodyPage,
  BotMailService,
  LinkRecord,
  TelegramConfig,
  TelegramMessage,
  TelegramSessionState,
  TelegramUpdate,
  TelegramUser,
  TelegramWidgetQuery,
  WidgetAction,
  WidgetView,
} from './types'
import { assertWidgetHtml } from './widget'

type Runtime = {
  config: TelegramConfig
  api: TelegramApi
  service: BotMailService
  widgetHtml: string
  timeZone: string
  minPrefix: number
  now: number
}

type Context = {
  mailboxes: MailboxDto[]
  active: MailboxDto | null
  inbox: { items: MessageListItem[]; total: number } | null
  inboxPage: number
  open: MessageDetail | null
}

type ContextOverrides = {
  mailboxes?: MailboxDto[]
  active?: MailboxDto | null
  open?: MessageDetail | null
}

export type TelegramHandlerDeps = {
  widgetHtml: string
  api?: TelegramApi
  service?: BotMailService
}

export async function handleTelegramUpdate(
  update: TelegramUpdate,
  deps: TelegramHandlerDeps,
): Promise<void> {
  const config = getTelegramConfig()
  if (!config) {
    throw new Error('[asms] Telegram bot is not configured')
  }

  const [timeZone, policy] = await Promise.all([
    getSetting('site.timezone').catch(() => 'Asia/Shanghai'),
    getMailPolicy().catch(() => null),
  ])

  const runtime: Runtime = {
    config,
    api: deps.api ?? new TelegramApi(config),
    service: deps.service ?? realMailService,
    widgetHtml: deps.widgetHtml,
    timeZone,
    minPrefix: policy?.minPrefixTemp ?? 8,
    now: Date.now(),
  }

  if (update.message) {
    await handleMessage(update.message, runtime)
    return
  }
  if (update.widget_query) {
    await handleWidgetQuery(update.widget_query, runtime)
  }
}

async function handleMessage(message: TelegramMessage, runtime: Runtime) {
  if (message.chat.type !== 'private') return
  const from = message.from
  if (!from || from.is_bot) return
  const text = message.text?.trim()
  if (!text) return

  const match = /^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/.exec(
    text,
  )
  if (!match) return

  const command = match[1].toLowerCase()
  const arg = (match[2] ?? '').trim()
  if (command === 'start') {
    await handleStart(message, from, arg, runtime)
    return
  }
  if (command === 'create') {
    await handleCreateCommand(message, from, arg, runtime)
  }
}

async function handleStart(
  message: TelegramMessage,
  from: TelegramUser,
  token: string,
  runtime: Runtime,
) {
  const chatId = message.chat.id

  if (token) {
    if (!isLinkToken(token)) {
      await sendText(runtime, chatId, '连接已失效，请在网页端重新生成。')
      return
    }

    const result = await consumeLinkToken({
      tokenHash: hashLinkToken(token),
      telegramUser: from,
    })
    if (!result.ok) {
      await sendText(
        runtime,
        chatId,
        result.reason === 'banned'
          ? '该账户已被封禁。'
          : result.reason === 'linked_elsewhere'
            ? '该 Telegram 账号已连接其他账户，请先在网页端断开。'
            : '连接已失效，请在网页端重新生成。',
      )
      return
    }

    await audit({
      actorId: result.userId,
      action: 'telegram.link',
      targetType: 'telegram',
      targetId: String(from.id),
      meta: { username: from.username ?? null },
    })
    await sendNewWidget(runtime, from, chatId, result.userId)
    return
  }

  const link = await getLink(String(from.id))
  if (!link) {
    await sendText(runtime, chatId, settingsText(runtime))
    return
  }
  if (link.banned) {
    await sendText(runtime, chatId, '该账户已被封禁。')
    return
  }
  await touchLink(String(from.id), from).catch(() => undefined)
  await sendNewWidget(runtime, from, chatId, link.userId)
}

async function handleCreateCommand(
  message: TelegramMessage,
  from: TelegramUser,
  prefix: string,
  runtime: Runtime,
) {
  const chatId = message.chat.id
  const link = await getLink(String(from.id))
  if (!link) {
    await sendText(runtime, chatId, settingsText(runtime))
    return
  }
  if (link.banned) {
    await sendText(runtime, chatId, '该账户已被封禁。')
    return
  }

  const createLocalPart = (
    prefix || randomTempLocalPart(runtime.minPrefix)
  ).toLowerCase()

  try {
    const loaded = await loadSession(String(from.id), String(chatId))
    if (loaded.activeMessageId) {
      const outcome = await runWidgetMutation({
        runtime,
        link,
        chatId,
        messageId: loaded.activeMessageId,
        action: { kind: 'create' },
        createLocalPart,
        onSaved: async () => undefined,
      })
      if (outcome.gone) {
        await sendNewWidget(runtime, from, chatId, link.userId)
      }
      return
    }
    await createAndSend(
      runtime,
      from,
      chatId,
      link.userId,
      link.role,
      createLocalPart,
    )
  } catch (error) {
    const text =
      error instanceof AppError ? error.message : '操作失败，请稍后重试'
    await sendText(runtime, chatId, text)
  }
}

async function sendNewWidget(
  runtime: Runtime,
  from: TelegramUser,
  chatId: number,
  userId: string,
) {
  const loaded = await loadSession(String(from.id), String(chatId))
  const widget = defaultWidgetView(runtime.now)
  const context = await loadContext(loaded, widget, userId, runtime)
  const built = buildChatData({
    state: loaded.state,
    widget,
    mailboxes: context.mailboxes,
    active: context.active,
    inbox: context.inbox,
    inboxPage: context.inboxPage,
    open: context.open,
    now: runtime.now,
    timeZone: runtime.timeZone,
    background: true,
  })
  await sendWidgetAndStore(runtime, loaded, chatId, widget, built.json)
}

async function createAndSend(
  runtime: Runtime,
  from: TelegramUser,
  chatId: number,
  userId: string,
  role: string,
  createLocalPart: string,
) {
  const loaded = await loadSession(String(from.id), String(chatId))
  const widget = defaultWidgetView(runtime.now)
  const result = await applyAction({
    state: loaded.state,
    widget,
    action: { kind: 'create' },
    userId,
    role,
    service: runtime.service,
    minPrefix: runtime.minPrefix,
    createLocalPart,
    bodyChars: runtime.config.bodyPageChars,
    bodyBytes: runtime.config.bodyPageBytes,
  })
  const context = await loadContext(loaded, widget, userId, runtime, {
    mailboxes: result.mailboxes,
    active: result.active,
  })
  const built = buildChatData({
    state: loaded.state,
    widget,
    mailboxes: context.mailboxes,
    active: context.active,
    inbox: context.inbox,
    inboxPage: context.inboxPage,
    open: context.open,
    now: runtime.now,
    timeZone: runtime.timeZone,
    background: true,
  })
  await sendWidgetAndStore(runtime, loaded, chatId, widget, built.json)
}

async function sendWidgetAndStore(
  runtime: Runtime,
  loaded: LoadedSession,
  chatId: number,
  widget: WidgetView,
  json: string,
) {
  assertWidgetHtml(runtime.widgetHtml)
  const sent = await runtime.api.sendWidget({
    chat_id: chatId,
    html: runtime.widgetHtml,
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
      chatId: String(chatId),
      activeMessageId: messageId,
      state: current.state,
      expectedVersion: current.version,
    })
    if (version !== null) return

    const fresh = await loadSession(current.telegramUserId, String(chatId))
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

type MutationInput = {
  runtime: Runtime
  link: LinkRecord
  chatId: number
  messageId: number
  action: WidgetAction
  createLocalPart?: string
  onSaved: (input: {
    changed: boolean
    seq: number
    result: ActionResult
  }) => Promise<void>
}

type MutationOutcome = {
  changed: boolean
  seq: number
  result: ActionResult
  gone: boolean
}

async function runWidgetMutation(
  input: MutationInput,
): Promise<MutationOutcome> {
  const { runtime, link } = input
  const telegramUserId = String(link.telegramUserId)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const loaded = await loadSession(telegramUserId, String(input.chatId))
    const widget = ensureWidget(loaded.state, input.messageId, runtime.now)
    loaded.activeMessageId = input.messageId

    const result = await applyAction({
      state: loaded.state,
      widget,
      action: input.action,
      userId: link.userId,
      role: link.role,
      service: runtime.service,
      minPrefix: runtime.minPrefix,
      createLocalPart: input.createLocalPart,
      bodyChars: runtime.config.bodyPageChars,
      bodyBytes: runtime.config.bodyPageBytes,
    })

    const context = await loadContext(loaded, widget, link.userId, runtime, {
      mailboxes: result.mailboxes,
      active: result.active,
      open: result.open,
    })

    const build = () =>
      buildChatData({
        state: loaded.state,
        widget,
        mailboxes: context.mailboxes,
        active: context.active,
        inbox: context.inbox,
        inboxPage: context.inboxPage,
        open: context.open,
        now: runtime.now,
        timeZone: runtime.timeZone,
        background: true,
      })

    let built = build()
    const changed = built.json !== widget.lastChatData
    let seq = widget.seq
    let json = built.json
    if (changed) {
      widget.seq += 1
      seq = widget.seq
      built = build()
      json = built.json
    }

    const version = await saveSession({
      telegramUserId,
      chatId: String(input.chatId),
      activeMessageId: input.messageId,
      state: loaded.state,
      expectedVersion: loaded.version,
    })
    if (version === null) continue

    await input.onSaved({ changed, seq, result })

    let gone = false
    if (changed) {
      try {
        await runtime.api.editMessageWidgetData({
          chat_id: input.chatId,
          message_id: input.messageId,
          chat_data: json,
        })
        widget.lastChatData = json
        widget.updatedAt = Date.now()
        await saveLastChatData({
          telegramUserId,
          messageId: input.messageId,
          chatData: json,
        })
      } catch (error) {
        if (isMessageNotModified(error)) {
          widget.lastChatData = json
          await saveLastChatData({
            telegramUserId,
            messageId: input.messageId,
            chatData: json,
          })
        } else if (isMessageGone(error)) {
          gone = true
        } else {
          console.error(
            '[asms] telegram widget edit failed',
            error instanceof Error ? error.message : error,
          )
        }
      }
    }

    return { changed, seq, result, gone }
  }

  throw new AppError('BUSY', '操作太频繁，请稍后重试')
}

async function handleWidgetQuery(query: TelegramWidgetQuery, runtime: Runtime) {
  if (!query.chat || query.chat.type !== 'private' || !query.message_id) {
    await answer(runtime, query, 'err:denied')
    return
  }
  if (!query.data || query.data.length > 64) {
    await answer(runtime, query, 'err:internal')
    return
  }

  const link = await getLink(String(query.from.id))
  if (!link) {
    await answerBlocked(runtime, query, 'unlinked')
    return
  }
  if (link.banned) {
    await answerBlocked(runtime, query, 'banned')
    return
  }

  const action = parseAction(query.data)
  if (!action) {
    await answer(runtime, query, 'err:internal')
    return
  }

  if (action.kind === 'body') {
    try {
      const loaded = await loadSession(
        String(query.from.id),
        String(query.chat.id),
      )
      const widget = ensureWidget(loaded.state, query.message_id, runtime.now)
      const result = await applyAction({
        state: loaded.state,
        widget,
        action,
        userId: link.userId,
        role: link.role,
        service: runtime.service,
        minPrefix: runtime.minPrefix,
        bodyChars: runtime.config.bodyPageChars,
        bodyBytes: runtime.config.bodyPageBytes,
      })
      if (!result.body) {
        throw new AppError('INTERNAL_ERROR', '正文不可用')
      }
      await answer(runtime, query, bodyAnswer(result.body, widget.seq))
    } catch (error) {
      const code = mapError(error)
      if (code === 'internal') {
        console.error('[asms] telegram body failed', error)
      }
      await answer(runtime, query, `err:${code}`)
    }
    return
  }

  const createLocalPart =
    action.kind === 'create'
      ? randomTempLocalPart(runtime.minPrefix)
      : undefined

  try {
    await runWidgetMutation({
      runtime,
      link,
      chatId: query.chat.id,
      messageId: query.message_id,
      action,
      createLocalPart,
      onSaved: async ({ changed, seq, result }) => {
        if (action.kind === 'read') {
          if (!result.body) {
            throw new AppError('INTERNAL_ERROR', '正文不可用')
          }
          await answer(runtime, query, bodyAnswer(result.body, seq))
          return
        }
        await answer(runtime, query, changed ? `ok:${seq}` : `same:${seq}`)
      },
    })
  } catch (error) {
    const code = mapError(error)
    if (code === 'internal' || code === 'busy') {
      console.error('[asms] telegram widget query failed', error)
    }
    await answer(runtime, query, `err:${code}`)
  }
}

async function loadContext(
  loaded: LoadedSession,
  widget: WidgetView,
  userId: string,
  runtime: Runtime,
  overrides: ContextOverrides = {},
): Promise<Context> {
  const mailboxes =
    overrides.mailboxes ?? (await runtime.service.listMailboxes(userId))
  const active =
    overrides.active !== undefined
      ? overrides.active
      : (mailboxes.find(
          (mailbox) => mailbox.id === loaded.state.activeMailboxId,
        ) ??
        mailboxes[0] ??
        null)
  loaded.state.activeMailboxId = active?.id ?? null

  const chipPages = mailboxes.length
    ? Math.ceil(mailboxes.length / MAILBOX_PAGE_SIZE)
    : 0
  widget.mailboxPage = chipPages
    ? clamp(widget.mailboxPage, 0, chipPages - 1)
    : 0

  let open: MessageDetail | null = null
  if (widget.view === 'mail') {
    open = overrides.open ?? null
    if (!open && widget.openId) {
      try {
        open = await runtime.service.getMessage(userId, widget.openId)
      } catch {
        open = null
      }
    }
    if (!open || open.mailboxId !== active?.id) {
      widget.view = 'home'
      widget.openId = null
      widget.error = 'gone'
      open = null
    }
  }

  let inbox: Context['inbox'] = null
  let inboxPage = 0
  if (widget.view === 'home' && active) {
    let page = Math.max(0, widget.page)
    let result = await runtime.service.listMessages({
      userId,
      mailboxId: active.id,
      page: page + 1,
      pageSize: INBOX_PAGE_SIZE,
    })
    const totalPages = result.total
      ? Math.ceil(result.total / INBOX_PAGE_SIZE)
      : 0
    if (totalPages && page >= totalPages) {
      page = totalPages - 1
      result = await runtime.service.listMessages({
        userId,
        mailboxId: active.id,
        page: page + 1,
        pageSize: INBOX_PAGE_SIZE,
      })
    }
    if (!totalPages) page = 0
    widget.page = page
    inbox = { items: result.items, total: result.total }
    inboxPage = page
  }

  return { mailboxes, active, inbox, inboxPage, open }
}

function mergeRefs(target: TelegramSessionState, source: TelegramSessionState) {
  for (const [ref, item] of Object.entries(source.refs.items)) {
    if (!target.refs.items[ref]) {
      target.refs.items[ref] = { ...item }
    }
  }
  target.refs.next = Math.max(target.refs.next, source.refs.next)
}

function bodyAnswer(body: BodyPage, seq: number) {
  return `${body.page}/${body.total}#${seq}\n${body.html}`
}

function isMessageNotModified(error: unknown) {
  return (
    error instanceof TelegramApiError &&
    /message is not modified/i.test(error.message)
  )
}

function isMessageGone(error: unknown) {
  return (
    error instanceof TelegramApiError &&
    /message to edit not found|message_id_invalid|chat not found|message can't be edited/i.test(
      error.message,
    )
  )
}

function mapError(error: unknown) {
  if (!(error instanceof AppError)) return 'internal'
  switch (error.code) {
    case 'MAILBOX_LIMIT_REACHED':
      return 'limit'
    case 'ADDRESS_TAKEN':
    case 'ADDRESS_COOLDOWN':
      return 'taken'
    case 'PREFIX_INVALID':
    case 'PREFIX_RESERVED':
    case 'PREFIX_TOO_SHORT':
    case 'PREFIX_TOO_LONG':
      return 'invalid'
    case 'NO_DOMAIN':
    case 'DOMAIN_NOT_FOUND':
    case 'DOMAIN_NOT_VERIFIED':
    case 'DOMAIN_DISABLED':
    case 'DOMAIN_TEMP_DISABLED':
      return 'domain'
    case 'MAILBOX_EXPIRED':
      return 'expired'
    case 'MAILBOX_NOT_FOUND':
    case 'MESSAGE_NOT_FOUND':
    case 'MAILBOX_DISABLED':
    case 'REF_EXPIRED':
      return 'gone'
    case 'MAILBOX_PERMANENT':
    case 'NOT_TEMPORARY':
      return 'permanent'
    case 'ACCOUNT_BANNED':
      return 'banned'
    case 'BUSY':
      return 'busy'
    default:
      return 'internal'
  }
}

async function answer(
  runtime: Runtime,
  query: TelegramWidgetQuery,
  data: string,
) {
  try {
    await runtime.api.answerWidgetQuery({
      widget_query_id: query.id,
      data,
    })
  } catch (error) {
    console.error(
      '[asms] telegram answer failed',
      error instanceof Error ? error.message : error,
    )
  }
}

async function answerBlocked(
  runtime: Runtime,
  query: TelegramWidgetQuery,
  code: 'unlinked' | 'banned',
) {
  await answer(runtime, query, `err:${code}`)
  if (!query.chat || !query.message_id) return
  const blocked = {
    v: 1,
    s: 0,
    m: null,
    a: null,
    k: 0,
    w: 0,
    p: 0,
    z: 0,
    lp: 0,
    lz: 0,
    l: [],
    i: [],
    e: code,
    b: 1,
  }
  try {
    await runtime.api.editMessageWidgetData({
      chat_id: query.chat.id,
      message_id: query.message_id,
      chat_data: JSON.stringify(blocked),
    })
  } catch (error) {
    console.error(
      '[asms] telegram blocked state edit failed',
      error instanceof Error ? error.message : error,
    )
  }
}

async function sendText(runtime: Runtime, chatId: number, text: string) {
  try {
    await runtime.api.sendMessage({
      chat_id: chatId,
      text,
      link_preview_options: { is_disabled: true },
    })
  } catch (error) {
    console.error(
      '[asms] telegram sendMessage failed',
      error instanceof Error ? error.message : error,
    )
  }
}

function settingsText(runtime: Runtime) {
  return `请先在 asms 个人设置中连接 Telegram：${runtime.config.baseUrl}/app/settings`
}
