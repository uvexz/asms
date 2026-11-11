import assert from 'node:assert/strict'
import test from 'node:test'

import { applyAction } from './actions'
import { buildNewMailWidget } from './push'
import { defaultSessionState } from './session'
import { FakeMailService, makeMailbox, makeMessage } from './test-fixtures'
import type { ChatDataMail } from './types'

test('a new mail widget opens the message and its mailbox', () => {
  const state = defaultSessionState()
  state.activeMailboxId = 'mb-old'

  const mailbox = makeMailbox({
    id: 'mb-new',
    localPart: 'new',
    address: 'new@example.com',
  })
  const message = makeMessage({
    id: 'msg-new',
    mailboxId: mailbox.id,
    mailboxAddress: mailbox.address,
    fromName: '顺丰速运',
    subject: '验证码 1234',
    hasAttachments: true,
    receivedAt: '2026-11-11T06:32:00.000Z',
  })

  const built = buildNewMailWidget({
    state,
    message,
    mailbox,
    now: Date.parse('2026-11-11T10:00:00.000Z'),
    timeZone: 'UTC',
  })

  assert.equal(built.widget.view, 'mail')
  assert.equal(built.widget.openId, message.id)
  assert.equal(state.activeMailboxId, mailbox.id)
  assert.ok(built.bytes <= 1024)

  const data = JSON.parse(built.json) as ChatDataMail
  assert.equal(data.v, 1)
  assert.equal(data.w, 1)
  assert.equal(data.a, mailbox.address)
  assert.equal(data.k, 0)
  assert.equal(data.b, 1)
  assert.deepEqual(data.o.slice(1), ['顺丰速运', '验证码 1234', '06:32', 1])

  assert.deepEqual(state.refs.items[data.o[0]], {
    id: message.id,
    k: 'message',
    t: built.widget.updatedAt,
  })
  assert.equal(state.refs.items[data.m ?? '']?.id, mailbox.id)
  assert.equal(state.refs.items[data.m ?? '']?.k, 'mailbox')
})

test('the pushed widget can load the body from the stored session state', async () => {
  const service = new FakeMailService()
  const mailbox = makeMailbox({ id: 'mb-new', localPart: 'new' })
  const message = makeMessage({
    id: 'msg-new',
    mailboxId: mailbox.id,
    textBody: '验证码 1234，五分钟内有效。',
  })
  service.mailboxes = [mailbox]
  service.messages.set(message.id, message)

  const state = defaultSessionState()
  const built = buildNewMailWidget({
    state,
    message,
    mailbox,
    now: Date.now(),
    timeZone: 'UTC',
  })
  const data = JSON.parse(built.json) as ChatDataMail

  const result = await applyAction({
    state,
    widget: built.widget,
    action: { kind: 'body', ref: data.o[0], page: 0 },
    userId: 'user-1',
    role: 'user',
    service,
    minPrefix: 8,
    bodyChars: 420,
    bodyBytes: 700,
  })

  assert.equal(result.answer, 'body')
  assert.equal(result.body?.page, 0)
  assert.equal(result.body?.total, 1)
  assert.match(result.body?.html ?? '', /1234/)
})
