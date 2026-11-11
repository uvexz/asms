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
  const seenLinks = new Set<string>()
  text = text.replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    (raw, attrs: string, inner: string) => {
      const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(
        attrs,
      )
      if (!match) return raw

      const decoded = decodeEntities(
        (match[1] ?? match[2] ?? match[3] ?? '').trim(),
      )
      const href = /^www\./i.test(decoded) ? `https://${decoded}` : decoded
      if (!/^https?:\/\/[^\s<>"']+$/i.test(href) || href.length > 2048) {
        return raw
      }

      const label = decodeEntities(
        inner
          .replace(/<[^>]*>/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      if (!label) {
        seenLinks.add(href)
        return href
      }
      if (label.includes(href)) {
        seenLinks.add(href)
        return raw
      }
      if (/https?:\/\/|www\./i.test(label)) return raw
      if (seenLinks.has(href)) return raw

      seenLinks.add(href)
      return `${raw} ${href}`
    },
  )
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

const BODY_HTML_LIMIT = 960

type BodyMark = {
  start: number
  end: number
  kind: 'link' | 'code'
  href?: string
}

const LINK_PATTERN =
  /(^|[^\w@])((?:https?:\/\/|www\.)[^\s<>"'`“”‘’，。；：！？、…（）【】《》「」『』]+)/gi

const CODE_TOKEN_PATTERN =
  /\b(?:(?=[A-Z0-9_-]*[A-Z])(?=[A-Z0-9_-]*\d)[A-Z0-9][A-Z0-9_-]{2,}[A-Z0-9]|\d{4,})\b/gi

const BRACKET_PAIRS: Array<[string, string]> = [
  [')', '('],
  [']', '['],
  ['}', '{'],
  ['）', '（'],
  ['】', '【'],
  ['》', '《'],
  ['」', '「'],
  ['』', '『'],
]

function trimUrl(value: string): string {
  let out = value.replace(/[.,;:!?'"”’，。；：！？、…]+$/u, '')
  let changed = true
  while (changed) {
    changed = false
    for (const [close, open] of BRACKET_PAIRS) {
      if (out.endsWith(close) && !out.includes(open)) {
        out = out.slice(0, -1)
        changed = true
      }
    }
  }
  return out
}

function normalizeLink(value: string): string | null {
  let href = value
  if (/^www\./i.test(href)) href = `https://${href}`
  if (!/^https:\/\//i.test(href)) return null

  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null

  const normalized = url.href
  if (normalized.length > 256) return null
  if (/%(?![0-9a-f]{2})/i.test(normalized)) return null
  if (/["<>\\^`{|}]/.test(normalized)) return null
  return normalized
}

function findBodyMarks(value: string): BodyMark[] {
  const marks: BodyMark[] = []
  const linkMarks: BodyMark[] = []
  const links = new RegExp(LINK_PATTERN.source, LINK_PATTERN.flags)
  let match: RegExpExecArray | null

  while ((match = links.exec(value))) {
    const prefix = match[1] ?? ''
    const start = match.index + prefix.length
    const visible = trimUrl(match[2] ?? '')
    if (!visible) continue
    const href = normalizeLink(visible)
    if (!href) continue
    const mark: BodyMark = {
      start,
      end: start + visible.length,
      kind: 'link',
      href,
    }
    marks.push(mark)
    linkMarks.push(mark)
    links.lastIndex = start + visible.length
  }

  const tokens = new RegExp(CODE_TOKEN_PATTERN.source, CODE_TOKEN_PATTERN.flags)
  let linkAt = 0
  while ((match = tokens.exec(value))) {
    const start = match.index
    const end = start + match[0].length
    if (value[start - 1] === '@' || value[end] === '@') continue
    if (value[start - 1] === '.' && value[end] === '.') continue
    while (linkAt < linkMarks.length && linkMarks[linkAt].end <= start) {
      linkAt += 1
    }
    if (linkAt < linkMarks.length && linkMarks[linkAt].start < end) continue
    marks.push({ start, end, kind: 'code' })
  }

  marks.sort((a, b) => a.start - b.start)
  return marks
}

function isLowSurrogate(code: number) {
  return code >= 0xdc00 && code <= 0xdfff
}

function nextBoundary(value: string, index: number): number {
  let next = Math.min(index, value.length)
  while (next < value.length && isLowSurrogate(value.charCodeAt(next))) {
    next += 1
  }
  return next
}

function prevBoundary(value: string, index: number): number {
  let prev = Math.min(index, value.length)
  while (prev > 0 && isLowSurrogate(value.charCodeAt(prev))) {
    prev -= 1
  }
  return prev
}

function bodyPageEnd(
  value: string,
  start: number,
  maxChars: number,
  maxBytes: number,
): number {
  let index = start
  let chars = 0
  let bytes = 0
  while (index < value.length) {
    const code = value.codePointAt(index)
    if (code === undefined) break
    const char = String.fromCodePoint(code)
    const size = Buffer.byteLength(char, 'utf8')
    if (chars + 1 > maxChars || bytes + size > maxBytes) break
    index += char.length
    chars += 1
    bytes += size
  }
  return index > start ? index : nextBoundary(value, start + 1)
}

function keepMarksWhole(marks: BodyMark[], start: number, end: number): number {
  for (const mark of marks) {
    if (mark.start < end && end < mark.end && mark.start > start) {
      return mark.start
    }
  }
  return end
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function renderRange(
  value: string,
  marks: BodyMark[],
  start: number,
  end: number,
): string {
  let html = ''
  let cursor = start
  for (const mark of marks) {
    if (mark.start < start || mark.end > end) continue
    html += escapeText(value.slice(cursor, mark.start))
    const visible = escapeText(value.slice(mark.start, mark.end))
    html +=
      mark.kind === 'link'
        ? `<a href="${escapeAttr(mark.href ?? '')}">${visible}</a>`
        : `<code>${visible}</code>`
    cursor = mark.end
  }
  html += escapeText(value.slice(cursor, end))
  return html
}

/**
 * Renders plain mail text as safe widget HTML pages: https links become
 * anchors, long numbers and digit-letter tokens become copyable <code>
 * elements, and pages never split either. The visible text keeps the
 * char/byte budgets and the rendered HTML stays under the widget answer
 * limit.
 */
export function renderBodyPages(
  value: string,
  maxChars: number,
  maxBytes: number,
): string[] {
  if (!value) return ['']
  const marks = findBodyMarks(value)
  const pages: string[] = []
  let start = 0

  while (start < value.length) {
    let end = bodyPageEnd(value, start, maxChars, maxBytes)
    if (end < value.length) {
      const cut = findCut(value.slice(start, end))
      if (cut > 0) end = start + cut
    }
    end = keepMarksWhole(marks, start, end)
    if (end <= start) end = nextBoundary(value, start + 1)

    let html = renderRange(value, marks, start, end)
    while (
      Buffer.byteLength(html, 'utf8') > BODY_HTML_LIMIT &&
      end > start + 1
    ) {
      const target = Math.max(
        start + 1,
        start + Math.floor((end - start) * 0.8),
      )
      let next = prevBoundary(value, target)
      next = keepMarksWhole(marks, start, next)
      if (next <= start) next = nextBoundary(value, start + 1)
      if (next >= end) next = prevBoundary(value, end - 1)
      end = next
      html = renderRange(value, marks, start, end)
    }

    pages.push(html)
    start = end
  }

  return pages.length ? pages : ['']
}
