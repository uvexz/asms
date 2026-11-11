import { randomTempLocalPart } from '#/lib/temp-address'
import { AppError } from '#/server/result'
import type { MailboxDto } from '#/server/services/mailboxes'
import type { MessageDetail } from '#/server/services/messages'

import { resolveRef } from './session'
import { messageBody, paginateBody } from './state'
import type {
  ActionResult,
  BodyPage,
  BotMailService,
  TelegramSessionState,
  WidgetAction,
  WidgetView,
} from './types'

export function parseAction(data: string): WidgetAction | null {
  if (!data || data.length > 64) return null
  if (data === 'create') return { kind: 'create' }
  if (data === 'refresh') return { kind: 'refresh' }
  if (data === 'back') return { kind: 'back' }

  let match = /^switch:([a-z0-9]+)$/.exec(data)
  if (match) return { kind: 'switch', ref: match[1] }

  match = /^page:(\d{1,3})$/.exec(data)
  if (match) return { kind: 'page', page: Number(match[1]) }

  match = /^mbpg:(\d{1,3})$/.exec(data)
  if (match) return { kind: 'mailboxPage', page: Number(match[1]) }

  match = /^read:([a-z0-9]+)$/.exec(data)
  if (match) return { kind: 'read', ref: match[1] }

  match = /^body:([a-z0-9]+):(\d{1,3})$/.exec(data)
  if (match) {
    return { kind: 'body', ref: match[1], page: Number(match[2]) }
  }

  match = /^mb:del:([a-z0-9]+)$/.exec(data)
  if (match) return { kind: 'deleteMailbox', ref: match[1] }

  match = /^msg:del:([a-z0-9]+)$/.exec(data)
  if (match) return { kind: 'deleteMessage', ref: match[1] }

  return null
}

type ActionInput = {
  state: TelegramSessionState
  widget: WidgetView
  action: WidgetAction
  userId: string
  role: string
  service: BotMailService
  minPrefix: number
  createLocalPart?: string
  bodyChars: number
  bodyBytes: number
}

function resetHome(widget: WidgetView, resetPage: boolean) {
  widget.view = 'home'
  widget.openId = null
  widget.error = ''
  if (resetPage) widget.page = 0
}

function isNotFound(error: unknown) {
  return (
    error instanceof AppError &&
    (error.code === 'MAILBOX_NOT_FOUND' || error.code === 'MESSAGE_NOT_FOUND')
  )
}

function fail(code: string, message: string): never {
  throw new AppError(code, message)
}

function bodyPage(
  message: MessageDetail,
  requested: number,
  input: ActionInput,
): BodyPage {
  const pages = paginateBody(
    messageBody(message),
    input.bodyChars,
    input.bodyBytes,
  )
  const page = Math.min(Math.max(0, requested), pages.length - 1)
  return { page, total: pages.length, chunk: pages[page] ?? '' }
}

function requireRef(
  state: TelegramSessionState,
  ref: string,
  kind: 'mailbox' | 'message',
) {
  const id = resolveRef(state, ref, kind)
  if (!id) fail('REF_EXPIRED', '内容已刷新，请重试')
  return id
}

async function createTempMailbox(input: ActionInput): Promise<ActionResult> {
  const localPart = (
    input.createLocalPart ?? randomTempLocalPart(input.minPrefix)
  )
    .trim()
    .toLowerCase()

  let mailbox: MailboxDto | undefined
  try {
    mailbox = await input.service.createTempMailbox({
      userId: input.userId,
      role: input.role,
      localPart,
    })
  } catch (error) {
    if (error instanceof AppError && error.code === 'ADDRESS_TAKEN') {
      const existing = (await input.service.listMailboxes(input.userId)).find(
        (item) => item.localPart === localPart && item.kind === 'temporary',
      )
      if (!existing) throw error
      mailbox = existing
    } else {
      throw error
    }
  }

  input.state.activeMailboxId = mailbox.id
  resetHome(input.widget, true)
  input.widget.mailboxPage = 0

  const mailboxes = await input.service.listMailboxes(input.userId)
  const active = mailboxes.find((item) => item.id === mailbox.id) ?? mailbox
  return { answer: 'ok', mailboxes, active }
}

async function switchMailbox(
  input: ActionInput,
  ref: string,
): Promise<ActionResult> {
  const realId = requireRef(input.state, ref, 'mailbox')
  const mailbox = await input.service.getMailbox(input.userId, realId)
  input.state.activeMailboxId = mailbox.id
  resetHome(input.widget, true)

  const mailboxes = await input.service.listMailboxes(input.userId)
  const index = mailboxes.findIndex((item) => item.id === mailbox.id)
  input.widget.mailboxPage = index >= 0 ? Math.floor(index / 6) : 0
  return {
    answer: 'ok',
    mailboxes,
    active: mailboxes[index] ?? mailbox,
  }
}

async function refreshMailboxes(input: ActionInput): Promise<ActionResult> {
  const mailboxes = await input.service.listMailboxes(input.userId)
  const active =
    mailboxes.find((item) => item.id === input.state.activeMailboxId) ??
    mailboxes[0] ??
    null
  input.state.activeMailboxId = active?.id ?? null
  input.widget.error = ''
  return { answer: 'ok', mailboxes, active }
}

async function readMessage(
  input: ActionInput,
  ref: string,
): Promise<ActionResult> {
  const realId = requireRef(input.state, ref, 'message')
  const message = await input.service.getMessage(input.userId, realId)
  if (message.mailboxId !== input.state.activeMailboxId) {
    fail('MESSAGE_NOT_FOUND', '邮件不存在')
  }
  if (!message.isRead) {
    await input.service.markRead(input.userId, message.id)
  }
  input.widget.view = 'mail'
  input.widget.openId = message.id
  input.widget.error = ''
  return {
    answer: 'body',
    body: bodyPage(message, 0, input),
    open: message,
  }
}

async function readBody(
  input: ActionInput,
  ref: string,
  page: number,
): Promise<ActionResult> {
  const realId = requireRef(input.state, ref, 'message')
  const message = await input.service.getMessage(input.userId, realId)
  if (
    message.mailboxId !== input.state.activeMailboxId ||
    input.widget.openId !== message.id
  ) {
    fail('MESSAGE_NOT_FOUND', '邮件不存在')
  }
  return {
    answer: 'body',
    body: bodyPage(message, page, input),
    open: message,
  }
}

async function deleteMailbox(
  input: ActionInput,
  ref: string,
): Promise<ActionResult> {
  const realId = requireRef(input.state, ref, 'mailbox')
  if (input.state.activeMailboxId !== realId) {
    fail('MAILBOX_NOT_FOUND', '邮箱不存在')
  }

  let mailbox: MailboxDto | undefined
  try {
    mailbox = await input.service.getMailbox(input.userId, realId)
  } catch (error) {
    if (!isNotFound(error)) throw error
  }
  if (mailbox && mailbox.kind !== 'temporary') {
    fail('MAILBOX_PERMANENT', '长期邮箱请在网页端删除')
  }
  try {
    await input.service.deleteTempMailbox(input.userId, realId)
  } catch (error) {
    if (!isNotFound(error)) throw error
  }

  input.state.activeMailboxId = null
  resetHome(input.widget, true)
  input.widget.mailboxPage = 0
  const mailboxes = await input.service.listMailboxes(input.userId)
  const active = mailboxes[0] ?? null
  input.state.activeMailboxId = active?.id ?? null
  return { answer: 'ok', mailboxes, active }
}

async function deleteMessage(
  input: ActionInput,
  ref: string,
): Promise<ActionResult> {
  const realId = requireRef(input.state, ref, 'message')
  if (input.widget.openId !== realId) {
    fail('MESSAGE_NOT_FOUND', '邮件不存在')
  }
  let message: MessageDetail | undefined
  try {
    message = await input.service.getMessage(input.userId, realId)
  } catch (error) {
    if (!isNotFound(error)) throw error
  }
  if (message) {
    if (message.mailboxId !== input.state.activeMailboxId) {
      fail('MESSAGE_NOT_FOUND', '邮件不存在')
    }
    try {
      await input.service.deleteMessage(input.userId, realId)
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
  }
  resetHome(input.widget, false)
  return { answer: 'ok' }
}

export async function applyAction(input: ActionInput): Promise<ActionResult> {
  switch (input.action.kind) {
    case 'create':
      return createTempMailbox(input)
    case 'switch':
      return switchMailbox(input, input.action.ref)
    case 'refresh':
      return refreshMailboxes(input)
    case 'page':
      input.widget.page = Math.max(0, Math.min(999, input.action.page))
      return { answer: 'ok' }
    case 'mailboxPage':
      input.widget.mailboxPage = Math.max(0, Math.min(999, input.action.page))
      return { answer: 'ok' }
    case 'read':
      return readMessage(input, input.action.ref)
    case 'body':
      return readBody(input, input.action.ref, input.action.page)
    case 'back':
      resetHome(input.widget, false)
      return { answer: 'ok' }
    case 'deleteMailbox':
      return deleteMailbox(input, input.action.ref)
    case 'deleteMessage':
      return deleteMessage(input, input.action.ref)
    default:
      fail('INVALID_ACTION', '未知操作')
  }
}
