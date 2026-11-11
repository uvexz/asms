import assert from 'node:assert/strict'
import test from 'node:test'

import { AppError } from '#/server/result'

import { applyAction, parseAction } from './actions'
import { allocRef, defaultSessionState, defaultWidgetView } from './session'
import { FakeMailService, makeMailbox, makeMessage } from './test-fixtures'
import type { WidgetAction } from './types'

function setup() {
  const service = new FakeMailService()
  const temp = makeMailbox({
    id: 'mb-temp',
    localPart: 'temp',
    address: 'temp@example.com',
    kind: 'temporary',
    unread: 1,
  })
  const permanent = makeMailbox({
    id: 'mb-perm',
    localPart: 'perm',
    address: 'perm@example.com',
    kind: 'permanent',
  })
  service.mailboxes = [temp, permanent]

  const message = makeMessage({
    id: 'msg-1',
    mailboxId: temp.id,
    mailboxAddress: temp.address,
    subject: '测试主题',
    fromName: '发件人',
    textBody: '第一段长正文😀。'.repeat(200),
  })
  service.messages.set(message.id, message)

  const state = defaultSessionState()
  state.activeMailboxId = temp.id
  const widget = defaultWidgetView()
  return {
    service,
    temp,
    permanent,
    message,
    state,
    widget,
    mailboxRef: allocRef(state, temp.id, 'mailbox', 1),
    messageRef: allocRef(state, message.id, 'message', 1),
    permanentRef: allocRef(state, permanent.id, 'mailbox', 1),
  }
}

function input(
  context: ReturnType<typeof setup>,
  action: WidgetAction,
  extra: Record<string, unknown> = {},
) {
  return {
    state: context.state,
    widget: context.widget,
    action,
    userId: 'user-1',
    role: 'user',
    service: context.service,
    minPrefix: 8,
    bodyChars: 420,
    bodyBytes: 700,
    ...extra,
  }
}

test('parseAction accepts the closed protocol and rejects malformed data', () => {
  assert.deepEqual(parseAction('create'), { kind: 'create' })
  assert.deepEqual(parseAction('refresh'), { kind: 'refresh' })
  assert.deepEqual(parseAction('back'), { kind: 'back' })
  assert.deepEqual(parseAction('switch:r1'), {
    kind: 'switch',
    ref: 'r1',
  })
  assert.deepEqual(parseAction('page:2'), { kind: 'page', page: 2 })
  assert.deepEqual(parseAction('mbpg:1'), {
    kind: 'mailboxPage',
    page: 1,
  })
  assert.deepEqual(parseAction('read:r2'), {
    kind: 'read',
    ref: 'r2',
  })
  assert.deepEqual(parseAction('body:r2:3'), {
    kind: 'body',
    ref: 'r2',
    page: 3,
  })
  assert.deepEqual(parseAction('mb:del:r1'), {
    kind: 'deleteMailbox',
    ref: 'r1',
  })
  assert.deepEqual(parseAction('msg:del:r2'), {
    kind: 'deleteMessage',
    ref: 'r2',
  })
  assert.equal(parseAction('nope'), null)
  assert.equal(parseAction('switch:'), null)
  assert.equal(parseAction('page:-1'), null)
  assert.equal(parseAction('x'.repeat(65)), null)
})

test('create chooses the real temp mailbox and resets the view', async () => {
  const context = setup()
  const result = await applyAction(
    input(context, { kind: 'create' }, { createLocalPart: 'newbox' }),
  )
  const created = context.service.mailboxes.find(
    (mailbox) => mailbox.localPart === 'newbox',
  )
  assert.ok(created)
  assert.equal(result.answer, 'ok')
  assert.equal(context.state.activeMailboxId, created.id)
  assert.equal(result.active?.id, created.id)
  assert.equal(context.widget.view, 'home')
  assert.equal(context.widget.page, 0)
  assert.equal(context.widget.mailboxPage, 0)
  assert.equal(
    context.service.mailboxes.filter(
      (mailbox) => mailbox.localPart === 'newbox',
    ).length,
    1,
  )
})

test('create treats an existing own address as idempotent', async () => {
  const context = setup()
  const result = await applyAction(
    input(context, { kind: 'create' }, { createLocalPart: 'temp' }),
  )
  assert.equal(result.active?.id, context.temp.id)
  assert.equal(context.state.activeMailboxId, context.temp.id)
})

test('switch moves the active mailbox and opens its chip page', async () => {
  const context = setup()
  const result = await applyAction(
    input(context, { kind: 'switch', ref: context.permanentRef }),
  )
  assert.equal(result.answer, 'ok')
  assert.equal(context.state.activeMailboxId, context.permanent.id)
  assert.equal(result.active?.id, context.permanent.id)
  assert.equal(context.widget.view, 'home')
  assert.equal(context.widget.page, 0)
})

test('read marks the real message read and returns the first body page', async () => {
  const context = setup()
  const result = await applyAction(
    input(context, { kind: 'read', ref: context.messageRef }),
  )
  assert.equal(result.answer, 'body')
  assert.ok(result.body)
  assert.ok(result.body.total >= 2)
  assert.ok(Buffer.byteLength(result.body.html, 'utf8') <= 960)
  assert.equal(context.widget.view, 'mail')
  assert.equal(context.widget.openId, context.message.id)
  assert.equal(context.service.messages.get(context.message.id)?.isRead, true)
})

test('body pagination, back and message deletion keep the inbox page', async () => {
  const context = setup()
  await applyAction(input(context, { kind: 'read', ref: context.messageRef }))
  const body = await applyAction(
    input(context, { kind: 'body', ref: context.messageRef, page: 1 }),
  )
  assert.equal(body.answer, 'body')
  assert.ok(body.body)
  assert.equal(body.body.page, 1)
  assert.ok(body.body.total >= 2)

  context.widget.page = 2
  await applyAction(input(context, { kind: 'back' }))
  assert.equal(context.widget.view, 'home')
  assert.equal(context.widget.openId, null)
  assert.equal(context.widget.page, 2)

  await applyAction(input(context, { kind: 'read', ref: context.messageRef }))
  const removed = await applyAction(
    input(context, { kind: 'deleteMessage', ref: context.messageRef }),
  )
  assert.equal(removed.answer, 'ok')
  assert.equal(context.widget.view, 'home')
  assert.equal(context.widget.openId, null)
  assert.equal(context.service.messages.has(context.message.id), false)
})

test('deleting a temp mailbox falls back to the next real mailbox', async () => {
  const context = setup()
  const result = await applyAction(
    input(context, { kind: 'deleteMailbox', ref: context.mailboxRef }),
  )
  assert.equal(result.answer, 'ok')
  assert.equal(context.state.activeMailboxId, context.permanent.id)
  assert.equal(context.widget.view, 'home')
  assert.equal(context.widget.page, 0)
  assert.equal(context.widget.mailboxPage, 0)
  assert.equal(
    context.service.mailboxes.some((mailbox) => mailbox.id === context.temp.id),
    false,
  )
})

test('permanent mailboxes cannot be deleted from the bot', async () => {
  const context = setup()
  context.state.activeMailboxId = context.permanent.id
  await assert.rejects(
    () =>
      applyAction(
        input(context, {
          kind: 'deleteMailbox',
          ref: context.permanentRef,
        }),
      ),
    (error: unknown) =>
      error instanceof AppError && error.code === 'MAILBOX_PERMANENT',
  )
})

test('refresh recovers a missing active mailbox', async () => {
  const context = setup()
  context.state.activeMailboxId = 'missing'
  const result = await applyAction(input(context, { kind: 'refresh' }))
  assert.equal(result.answer, 'ok')
  assert.equal(context.state.activeMailboxId, context.temp.id)
  assert.equal(result.active?.id, context.temp.id)
  assert.equal(context.widget.error, '')
})

test('page and chip page actions update only the view state', async () => {
  const context = setup()
  await applyAction(input(context, { kind: 'page', page: 3 }))
  assert.equal(context.widget.page, 3)
  await applyAction(input(context, { kind: 'mailboxPage', page: 2 }))
  assert.equal(context.widget.mailboxPage, 2)
})

test('a forged or pruned ref is rejected', async () => {
  const context = setup()
  await assert.rejects(
    () => applyAction(input(context, { kind: 'read', ref: 'r999' })),
    (error: unknown) =>
      error instanceof AppError && error.code === 'REF_EXPIRED',
  )
})
