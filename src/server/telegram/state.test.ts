import assert from 'node:assert/strict'
import test from 'node:test'

import {
  allocRef,
  defaultSessionState,
  defaultWidgetView,
  parseSessionState,
  serializeSessionState,
} from './session'
import {
  buildChatData,
  clipBytes,
  formatTime,
  htmlToText,
  paginateBody,
} from './state'
import { makeMailbox, makeMessage, toListItem } from './test-fixtures'

test('formatTime uses the site timezone and short dates', () => {
  const now = Date.parse('2026-11-11T10:00:00.000Z')
  assert.equal(formatTime('2026-11-11T06:32:00.000Z', 'UTC', now), '06:32')
  assert.equal(formatTime('2026-11-09T06:32:00.000Z', 'UTC', now), '11/9')
  assert.equal(formatTime('not-a-date', 'UTC', now), '')
})

test('htmlToText strips scripts/styles and decodes common entities', () => {
  assert.equal(
    htmlToText(
      '<p>Hello &amp; <b>world</b></p><script>evil()</script><p>Line&nbsp;2</p>',
    ),
    'Hello & world\n\nLine 2',
  )
  assert.equal(
    htmlToText('<div>A<br>B</div><style>x</style><ul><li>One</li></ul>'),
    'A\nB\n\n• One',
  )
})

test('clipBytes never splits a code point and respects the byte limit', () => {
  assert.equal(clipBytes('你好世界', 7), '你好')
  assert.ok(Buffer.byteLength(clipBytes('abcdef', 4), 'utf8') <= 4)
  assert.equal(clipBytes('abcdef', 10), 'abcdef')
})

test('paginateBody reconstructs the text and respects both limits', () => {
  const text = '邮件内容😀 with ASCII and a long line\n'.repeat(400)
  const pages = paginateBody(text, 120, 300)
  assert.ok(pages.length > 1)
  assert.equal(pages.join(''), text)
  for (const page of pages) {
    assert.ok([...page].length <= 120)
    assert.ok(Buffer.byteLength(page, 'utf8') <= 300)
  }
  assert.deepEqual(paginateBody('', 120, 300), [''])
})

test('buildChatData maps UUIDs to short refs and stays <= 1024 bytes', () => {
  const now = Date.parse('2026-11-11T10:00:00.000Z')
  const mailboxes = Array.from({ length: 8 }, (_, index) =>
    makeMailbox({
      id: `00000000-0000-4000-8000-00000000000${index}`,
      localPart: 'a'.repeat(32),
      address: `${'a'.repeat(32)}@example.com`,
      kind: index === 0 ? 'permanent' : 'temporary',
      unread: index,
    }),
  )
  const messages = Array.from({ length: 4 }, (_, index) =>
    makeMessage({
      id: `11111111-1111-4111-8111-11111111111${index}`,
      mailboxId: mailboxes[0].id,
      subject: '这是一个非常长的中文邮件主题'.repeat(4),
      fromName: '这是一个很长的发件人名字'.repeat(2),
      fromAddress: 'sender-with-a-long-address@example.com',
      receivedAt: new Date(now - index * 60_000).toISOString(),
      isRead: index % 2 === 0,
    }),
  )

  const state = defaultSessionState()
  state.activeMailboxId = mailboxes[0].id
  const widget = defaultWidgetView()
  widget.seq = 7
  widget.mailboxPage = 1

  const built = buildChatData({
    state,
    widget,
    mailboxes,
    active: mailboxes[0],
    inbox: {
      items: messages.map(toListItem),
      total: 9,
    },
    inboxPage: 0,
    open: null,
    now,
    timeZone: 'UTC',
    background: true,
    widgetHeight: 540,
  })

  assert.ok(built.bytes <= 1024, `state was ${built.bytes} bytes`)
  assert.equal(built.json.includes(mailboxes[0].id), false)
  assert.equal(built.json.includes(messages[0].id), false)

  const data = JSON.parse(built.json) as Record<string, unknown>
  assert.equal(data.v, 1)
  assert.equal(data.w, 0)
  assert.equal(data.s, 7)
  assert.equal(data.k, 1)
  assert.equal(data.b, 1)
  assert.equal(data.lz, 2)
  assert.equal(data.lp, 1)
  assert.equal(data.z, 3)
  assert.equal(data.p, 0)
  assert.equal(data.h, 540)
  assert.equal(data.a, mailboxes[0].address)
  assert.equal((data.l as unknown[]).length, 2)
  assert.equal((data.i as unknown[]).length, 4)
})

test('buildChatData for the mail view stays small and omits the inbox list', () => {
  const now = Date.parse('2026-11-11T10:00:00.000Z')
  const mailbox = makeMailbox({
    id: '00000000-0000-4000-8000-000000000001',
  })
  const message = makeMessage({
    id: '11111111-1111-4111-8111-111111111111',
    mailboxId: mailbox.id,
    hasAttachments: true,
  })
  const state = defaultSessionState()
  state.activeMailboxId = mailbox.id
  const widget = defaultWidgetView()
  widget.view = 'mail'
  widget.openId = message.id

  const built = buildChatData({
    state,
    widget,
    mailboxes: [mailbox],
    active: mailbox,
    inbox: null,
    inboxPage: 0,
    open: message,
    now,
    timeZone: 'UTC',
    background: true,
    widgetHeight: 540,
  })

  assert.ok(built.bytes <= 1024)
  const data = JSON.parse(built.json) as Record<string, unknown>
  assert.equal(data.w, 1)
  assert.equal(data.l, undefined)
  assert.equal(data.i, undefined)
  assert.equal((data.o as unknown[]).length, 5)
  assert.equal((data.o as unknown[])[4], 1)
})

test('buildChatData clamps extreme strings into the hard limit', () => {
  const now = Date.parse('2026-11-11T10:00:00.000Z')
  const mailbox = makeMailbox({
    id: '00000000-0000-4000-8000-000000000001',
    localPart: 'a'.repeat(32),
    address: `${'a'.repeat(32)}@example.com`,
  })
  const messages = Array.from({ length: 4 }, (_, index) =>
    makeMessage({
      id: `11111111-1111-4111-8111-11111111111${index}`,
      mailboxId: mailbox.id,
      subject: '题'.repeat(2000),
      fromName: '发'.repeat(2000),
    }),
  )
  const state = defaultSessionState()
  state.activeMailboxId = mailbox.id
  const widget = defaultWidgetView()
  const built = buildChatData({
    state,
    widget,
    mailboxes: [mailbox],
    active: mailbox,
    inbox: { items: messages.map(toListItem), total: 4 },
    inboxPage: 0,
    open: null,
    now,
    timeZone: 'UTC',
    background: true,
    widgetHeight: 540,
  })
  assert.ok(built.bytes <= 1024, `state was ${built.bytes} bytes`)
})

test('short refs reuse entries and session state round-trips', () => {
  const state = defaultSessionState()
  const first = allocRef(state, 'real-1', 'message', 1)
  const second = allocRef(state, 'real-1', 'message', 2)
  const other = allocRef(state, 'real-2', 'mailbox', 3)
  assert.equal(first, second)
  assert.notEqual(first, other)

  state.activeMailboxId = 'real-2'
  state.widgets['123'] = {
    ...defaultWidgetView(10),
    seq: 2,
    lastChatData: '{"v":1}',
  }
  const parsed = parseSessionState(serializeSessionState(state))
  assert.ok(parsed)
  assert.equal(parsed.activeMailboxId, 'real-2')
  assert.equal(parsed.refs.items[first].id, 'real-1')
  assert.equal(parsed.refs.items[other].k, 'mailbox')
  assert.equal(parsed.widgets['123'].seq, 2)
  assert.equal(parsed.widgets['123'].lastChatData, '{"v":1}')
})
