import type { MailboxDto } from '#/server/services/mailboxes'
import type { MessageDetail, MessageListItem } from '#/server/services/messages'

import { allocRef, pruneRefs } from './session'
import type {
  ChatData,
  ChatDataHome,
  ChatDataMail,
  TelegramSessionState,
  WidgetView,
} from './types'

export const INBOX_PAGE_SIZE = 4
export const MAILBOX_PAGE_SIZE = 6
const STATE_LIMIT = 1024
const BODY_LIMIT = 64 * 1024

export type BuildInput = {
  state: TelegramSessionState
  widget: WidgetView
  mailboxes: MailboxDto[]
  active: MailboxDto | null
  inbox: { items: MessageListItem[]; total: number } | null
  /** 0-based page of `inbox.items` (already fetched and clamped). */
  inboxPage: number
  open: MessageDetail | null
  now: number
  timeZone: string
  background: boolean
}

export type BuiltChatData = {
  data: ChatData
  json: string
  bytes: number
}

type Limits = {
  from: number
  subject: number
  local: number
  openFrom: number
  openSubject: number
}

const LIMITS: Limits[] = [
  { from: 32, subject: 64, local: 24, openFrom: 48, openSubject: 96 },
  { from: 24, subject: 48, local: 16, openFrom: 32, openSubject: 64 },
  { from: 16, subject: 32, local: 12, openFrom: 24, openSubject: 48 },
  { from: 12, subject: 24, local: 8, openFrom: 16, openSubject: 32 },
]

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.floor(value)))
}

export function clipBytes(value: string, max: number): string {
  let out = ''
  let bytes = 0
  for (const char of value) {
    const size = Buffer.byteLength(char, 'utf8')
    if (bytes + size > max) break
    out += char
    bytes += size
  }
  if (out.length < value.length && bytes + 3 <= max) out += '…'
  return out
}

function cleanInline(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex -- control bytes in mail headers
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function clipInline(value: string, max: number): string {
  return clipBytes(cleanInline(value), max)
}

function fromDisplay(value: { fromName: string | null; fromAddress: string }) {
  const name = cleanInline(value.fromName ?? '')
  return name || cleanInline(value.fromAddress)
}

const FORMATTERS = new Map<
  string,
  { day: Intl.DateTimeFormat; time: Intl.DateTimeFormat }
>()

function formatters(timeZone: string) {
  let value = FORMATTERS.get(timeZone)
  if (!value) {
    value = {
      day: new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
      time: new Intl.DateTimeFormat('zh-CN', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    }
    FORMATTERS.set(timeZone, value)
  }
  return value
}

export function formatTime(
  value: string,
  timeZone: string,
  now: number,
): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const format = formatters(timeZone)
  const day = format.day.format(date)
  if (day === format.day.format(new Date(now))) {
    return format.time.format(date)
  }
  const [, month, dateOfMonth] = day.split('-')
  return `${Number(month)}/${Number(dateOfMonth)}`
}

function buildOnce(input: BuildInput, limits: Limits): ChatData {
  const { state, widget, now } = input
  const activeRef = input.active
    ? allocRef(state, input.active.id, 'mailbox', now)
    : null
  const base: Pick<ChatDataHome, 'v' | 's' | 'm' | 'a' | 'k' | 'e' | 'b'> = {
    v: 1,
    s: widget.seq,
    m: activeRef,
    a: input.active?.address ?? null,
    k: input.active?.kind === 'permanent' ? 1 : 0,
    e: widget.error.slice(0, 16),
    b: input.background ? 1 : 0,
  }

  if (widget.view === 'mail' && input.open) {
    const data: ChatDataMail = {
      ...base,
      w: 1,
      o: [
        allocRef(state, input.open.id, 'message', now),
        clipInline(fromDisplay(input.open), limits.openFrom),
        clipInline(input.open.subject, limits.openSubject),
        formatTime(input.open.receivedAt, input.timeZone, now),
        input.open.hasAttachments ? 1 : 0,
      ],
    }
    return data
  }

  const mailboxCount = input.mailboxes.length
  const lz = mailboxCount ? Math.ceil(mailboxCount / MAILBOX_PAGE_SIZE) : 0
  const lp = lz ? clamp(widget.mailboxPage, 0, lz - 1) : 0
  const chips = lz
    ? input.mailboxes.slice(
        lp * MAILBOX_PAGE_SIZE,
        (lp + 1) * MAILBOX_PAGE_SIZE,
      )
    : []
  const l: ChatDataHome['l'] = chips.map((mailbox) => [
    allocRef(state, mailbox.id, 'mailbox', now),
    clipInline(mailbox.localPart, limits.local),
    Math.min(99, mailbox.unread),
  ])

  const items = input.inbox?.items ?? []
  const total = input.inbox?.total ?? 0
  const z = total ? Math.ceil(total / INBOX_PAGE_SIZE) : 0
  const p = z ? clamp(input.inboxPage, 0, z - 1) : 0
  const i: ChatDataHome['i'] = items.map((message) => [
    allocRef(state, message.id, 'message', now),
    clipInline(fromDisplay(message), limits.from),
    clipInline(message.subject, limits.subject),
    formatTime(message.receivedAt, input.timeZone, now),
    message.isRead ? 0 : 1,
  ])

  return { ...base, w: 0, p, z, lp, lz, l, i }
}

function minimalData(input: BuildInput): ChatDataHome {
  return {
    v: 1,
    s: input.widget.seq,
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
    e: 'internal',
    b: input.background ? 1 : 0,
  }
}

/**
 * Projects the current real mailbox data into the widget's <=1024-byte
 * chat_data. Real UUIDs are mapped to short refs so the state stays small.
 */
export function buildChatData(input: BuildInput): BuiltChatData {
  for (const limits of LIMITS) {
    const data = buildOnce(input, limits)
    const json = JSON.stringify(data)
    const bytes = Buffer.byteLength(json, 'utf8')
    if (bytes <= STATE_LIMIT) {
      pruneRefs(input.state)
      return { data, json, bytes }
    }
  }

  const data = minimalData(input)
  const json = JSON.stringify(data)
  pruneRefs(input.state)
  return { data, json, bytes: Buffer.byteLength(json, 'utf8') }
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  trade: '™',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  euro: '€',
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (raw, body: string) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10)
      if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
        try {
          return String.fromCodePoint(code)
        } catch {
          return raw
        }
      }
      return raw
    }
    return ENTITIES[body.toLowerCase()] ?? raw
  })
}

function normalizeText(value: string, collapseSpaces: boolean): string {
  // eslint-disable-next-line no-control-regex -- strip NUL from mail bodies
  let text = value.replace(/\r\n?/g, '\n').replace(/\u0000/g, '')
  // eslint-disable-next-line no-control-regex -- strip other control bytes
  text = text.replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  if (collapseSpaces) text = text.replace(/[ \t]+/g, ' ')
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizeBody(value: string): string {
  return normalizeText(value, false)
}

export function htmlToText(value: string): string {
  let text = value.replace(/<!--[\s\S]*?-->/g, '')
  text = text.replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, '')
  text = text.replace(/<br\s*\/?>/gi, '\n')
  text = text.replace(/<hr\s*\/?>/gi, '\n\n')
  text = text.replace(/<li\b[^>]*>/gi, '• ')
  text = text.replace(
    /<\/(?:p|div|blockquote|section|article|header|footer|ul|ol|table|pre|h[1-6])>/gi,
    '\n\n',
  )
  text = text.replace(/<\/(?:li|tr)>/gi, '\n')
  text = text.replace(/<\/(?:td|th)>/gi, ' ')
  text = text.replace(/<[^>]+>/g, '')
  text = decodeEntities(text)
  return normalizeText(text, true)
}

export function messageBody(message: MessageDetail): string {
  const plain = (message.textBody ?? '').trim()
  const body = plain ? normalizeBody(plain) : htmlToText(message.htmlBody ?? '')
  if (!body) return '（无正文）'
  return clipBytes(body, BODY_LIMIT)
}

function findCut(page: string): number {
  const min = Math.floor(page.length * 0.6)
  const newline = page.lastIndexOf('\n')
  const space = page.lastIndexOf(' ')
  const cut = Math.max(newline, space)
  return cut >= min ? cut + 1 : -1
}

/**
 * Splits plain text into pages bounded by both UTF-16 character count and
 * UTF-8 bytes. Prefers a newline/space near the end of a page, never splits a
 * surrogate pair, and `pages.join('')` reconstructs the input.
 */
export function paginateBody(
  value: string,
  maxChars: number,
  maxBytes: number,
): string[] {
  if (!value) return ['']
  const pages: string[] = []
  let page = ''
  let chars = 0
  let bytes = 0

  for (const char of value) {
    const size = Buffer.byteLength(char, 'utf8')
    if (page && (chars + 1 > maxChars || bytes + size > maxBytes)) {
      const cut = findCut(page)
      if (cut > 0) {
        pages.push(page.slice(0, cut))
        page = page.slice(cut)
      } else {
        pages.push(page)
        page = ''
      }
      chars = [...page].length
      bytes = Buffer.byteLength(page, 'utf8')
      if (page && (chars + 1 > maxChars || bytes + size > maxBytes)) {
        pages.push(page)
        page = ''
        chars = 0
        bytes = 0
      }
    }
    page += char
    chars += 1
    bytes += size
  }
  if (page) pages.push(page)
  return pages.length ? pages : ['']
}
