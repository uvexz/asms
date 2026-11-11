import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type {
  IncomingMessage,
  ServerResponse,
} from 'node:http'

import { AppError } from '#/server/result'
import type { MailboxDto } from '#/server/services/mailboxes'
import type {
  MessageDetail,
  MessageListItem,
} from '#/server/services/messages'
import { applyAction, parseAction } from '#/server/telegram/actions'
import {
  defaultSessionState,
  defaultWidgetView,
} from '#/server/telegram/session'
import {
  buildChatData,
  clamp,
  INBOX_PAGE_SIZE,
  MAILBOX_PAGE_SIZE,
} from '#/server/telegram/state'
import {
  FakeMailService,
  makeMailbox,
  makeMessage,
} from '#/server/telegram/test-fixtures'
import type {
  BodyPage,
  TelegramSessionState,
  WidgetView,
} from '#/server/telegram/types'

type PreviewContext = {
  mailboxes: MailboxDto[]
  active: MailboxDto | null
  inbox: { items: MessageListItem[]; total: number } | null
  inboxPage: number
  open: MessageDetail | null
}

type PreviewOverrides = {
  mailboxes?: MailboxDto[]
  active?: MailboxDto | null
  open?: MessageDetail | null
}

let service = new FakeMailService()
let session: TelegramSessionState = defaultSessionState()
let widget: WidgetView = defaultWidgetView()
let initialChatData = ''

async function reset() {
  service = new FakeMailService()
  const temp = makeMailbox({
    id: 'mb-temp',
    localPart: 'preview',
    address: 'preview@example.com',
    kind: 'temporary',
    unread: 2,
  })
  const permanent = makeMailbox({
    id: 'mb-perm',
    localPart: 'hello',
    address: 'hello@example.com',
    kind: 'permanent',
  })
  service.mailboxes = [temp, permanent]

  const now = Date.now()
  const samples: Array<{
    fromName: string
    subject: string
    textBody: string
    htmlBody?: string
    hasAttachments?: boolean
    isRead?: boolean
  }> = [
    {
      fromName: 'asms',
      subject: '欢迎使用 Telegram 邮箱',
      textBody:
        '这是一张真实状态驱动的临时邮箱卡片。\n\n可以新建临时邮箱、切换邮箱、刷新收件箱、阅读正文和删除邮件。\n\n自定义前缀：在聊天里发送 /create name。',
    },
    {
      fromName: 'GitHub',
      subject: 'Your verification code',
      textBody:
        'Your verification code is 482913.\n\nThis code expires in 10 minutes. If you did not request it, ignore this message.',
    },
    {
      fromName: 'Example Service',
      subject: 'Verify your email',
      textBody: '',
      htmlBody:
        '<p>Hello,</p><p>Your verification code is <b>482913</b>, backup A1B2C3.</p><p>Reference 1234, order 98765.</p><p><a href="https://example.com/verify?token=abc123&amp;user=1">Verify your email</a></p>',
    },
    {
      fromName: 'Long Link',
      subject: '长链接分页测试',
      textBody: `${'这是一段较长的说明文字。'.repeat(18)}\n\nhttps://example.com/reset?token=${'a'.repeat(180)}\n\n完成。`,
    },
    {
      fromName: '测试发件人',
      subject: '中文长正文与分页测试',
      textBody:
        '第一段：这一段正文比较长，用来验证小部件内的正文分页。'.repeat(
          40,
        ),
    },
    {
      fromName: 'Example Service',
      subject: '含附件的邮件',
      textBody:
        '这封邮件带一个附件。Widget 内只提示附件存在，下载请回到网页端。',
      hasAttachments: true,
    },
    {
      fromName: 'Newsletter',
      subject: '更早的一封邮件',
      textBody: '第二页的邮件，用来验证收件箱翻页。',
      isRead: true,
    },
  ]

  samples.forEach((sample, index) => {
    const message = makeMessage({
      id: `msg-${index + 1}`,
      mailboxId: temp.id,
      mailboxAddress: temp.address,
      fromName: sample.fromName,
      subject: sample.subject,
      textBody: sample.textBody,
      htmlBody: sample.htmlBody ?? null,
      hasAttachments: sample.hasAttachments ?? false,
      isRead: sample.isRead ?? false,
      receivedAt: new Date(now - index * 3_600_000).toISOString(),
    })
    service.messages.set(message.id, message)
  })

  session = defaultSessionState()
  session.activeMailboxId = temp.id
  widget = defaultWidgetView(now)

  const context = await loadContext()
  const built = buildChatData({
    state: session,
    widget,
    mailboxes: context.mailboxes,
    active: context.active,
    inbox: context.inbox,
    inboxPage: context.inboxPage,
    open: context.open,
    now,
    timeZone: 'Asia/Shanghai',
    background: true,
  })
  widget.lastChatData = built.json
  initialChatData = built.json
}

async function loadContext(
  overrides: PreviewOverrides = {},
): Promise<PreviewContext> {
  const mailboxes =
    overrides.mailboxes ?? (await service.listMailboxes())
  const active =
    overrides.active !== undefined
      ? overrides.active
      : (mailboxes.find(
          (mailbox) => mailbox.id === session.activeMailboxId,
        ) ??
        mailboxes[0] ??
        null)
  session.activeMailboxId = active?.id ?? null

  const chipPages = mailboxes.length
    ? Math.ceil(mailboxes.length / MAILBOX_PAGE_SIZE)
    : 0
  widget.mailboxPage = chipPages
    ? clamp(widget.mailboxPage, 0, chipPages - 1)
    : 0

  let open: MessageDetail | null = overrides.open ?? null
  if (widget.view === 'mail') {
    if (!open && widget.openId) {
      try {
        open = await service.getMessage('preview', widget.openId)
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

  let inbox: PreviewContext['inbox'] = null
  let inboxPage = 0
  if (widget.view === 'home' && active) {
    let page = Math.max(0, widget.page)
    let result = await service.listMessages({
      userId: 'preview',
      mailboxId: active.id,
      page: page + 1,
      pageSize: INBOX_PAGE_SIZE,
    })
    const totalPages = result.total
      ? Math.ceil(result.total / INBOX_PAGE_SIZE)
      : 0
    if (totalPages && page >= totalPages) {
      page = totalPages - 1
      result = await service.listMessages({
        userId: 'preview',
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

function bodyAnswer(body: BodyPage, seq: number) {
  return `${body.page}/${body.total}#${seq}\n${body.html}`
}

function previewError(error: unknown) {
  if (error instanceof AppError) {
    if (
      error.code === 'MAILBOX_PERMANENT' ||
      error.code === 'NOT_TEMPORARY'
    ) {
      return 'permanent'
    }
    if (error.code === 'ADDRESS_TAKEN') return 'taken'
    if (error.code === 'MAILBOX_LIMIT_REACHED') return 'limit'
    if (error.code.startsWith('PREFIX_')) return 'invalid'
    if (
      error.code === 'REF_EXPIRED' ||
      error.code.endsWith('_NOT_FOUND')
    ) {
      return 'gone'
    }
    if (error.code === 'MAILBOX_EXPIRED') return 'expired'
    if (error.code === 'NO_DOMAIN') return 'domain'
  }
  return 'internal'
}

async function handleRequest(data: string) {
  const action = parseAction(data)
  if (!action) return { answer: 'err:internal' }
  const now = Date.now()

  try {
    if (action.kind === 'body') {
      const result = await applyAction({
        state: session,
        widget,
        action,
        userId: 'preview',
        role: 'user',
        service,
        minPrefix: 8,
        bodyChars: 420,
        bodyBytes: 700,
      })
      return {
        answer: result.body
          ? bodyAnswer(result.body, widget.seq)
          : 'err:internal',
      }
    }

    const result = await applyAction({
      state: session,
      widget,
      action,
      userId: 'preview',
      role: 'user',
      service,
      minPrefix: 8,
      bodyChars: 420,
      bodyBytes: 700,
    })
    const context = await loadContext({
      mailboxes: result.mailboxes,
      active: result.active,
      open: result.open,
    })
    const build = () =>
      buildChatData({
        state: session,
        widget,
        mailboxes: context.mailboxes,
        active: context.active,
        inbox: context.inbox,
        inboxPage: context.inboxPage,
        open: context.open,
        now,
        timeZone: 'Asia/Shanghai',
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
    widget.lastChatData = json

    if (action.kind === 'read') {
      return {
        answer: result.body
          ? bodyAnswer(result.body, seq)
          : 'err:internal',
        chatData: json,
      }
    }
    return {
      answer: changed ? `ok:${seq}` : `same:${seq}`,
      chatData: json,
    }
  } catch (error) {
    return { answer: `err:${previewError(error)}` }
  }
}

const LIGHT = {
  '--tg-theme-bg-color': '#ffffff',
  '--tg-theme-text-color': '#111111',
  '--tg-theme-hint-color': '#707579',
  '--tg-theme-link-color': '#3390ec',
  '--tg-theme-button-color': '#3390ec',
  '--tg-theme-button-text-color': '#ffffff',
  '--tg-theme-secondary-bg-color': '#f1f2f4',
  '--tg-theme-section-separator-color': '#e4e6ea',
  '--tg-theme-destructive-text-color': '#d14343',
}

const DARK = {
  '--tg-theme-bg-color': '#17212b',
  '--tg-theme-text-color': '#f5f5f5',
  '--tg-theme-hint-color': '#8a9aa9',
  '--tg-theme-link-color': '#6ab3f3',
  '--tg-theme-button-color': '#5288c1',
  '--tg-theme-button-text-color': '#ffffff',
  '--tg-theme-secondary-bg-color': '#232e3c',
  '--tg-theme-section-separator-color': '#2f3b4a',
  '--tg-theme-destructive-text-color': '#ff6b6b',
}

function stubScript(theme: 'light' | 'dark', chatData: string) {
  const vars = theme === 'dark' ? DARK : LIGHT
  return `<script>(function(){var V=${JSON.stringify(vars)};var s=document.createElement('style');s.textContent=':root{'+Object.keys(V).map(function(k){return k+':'+V[k]}).join(';')+'}html,body{background:var(--tg-theme-bg-color);color:var(--tg-theme-text-color)}a[href]{color:var(--tg-theme-link-color);text-decoration:none}';document.head.appendChild(s);var H={},state=${JSON.stringify(chatData)};var W={profile:1,isProfileAtLeast:function(){return true},colorScheme:${JSON.stringify(theme)},themeParams:{},isActive:true,isPreview:false,isForward:false,chatType:'private',viewer:{id:1,first_name:'Preview'},publicData:null,chatData:state,onEvent:function(t,f){(H[t]||(H[t]=[])).push(f)},offEvent:function(){},ready:function(){},copyText:function(t){if(navigator.clipboard)navigator.clipboard.writeText(t).catch(function(){})},request:function(data){return fetch('/preview/request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({data:data})}).then(function(r){return r.json()}).then(function(res){if(res.chatData){state=res.chatData;W.chatData=state;(H.chatDataChanged||[]).forEach(function(f){try{f()}catch(e){}})}return{result:res.answer}})},openLink:function(u){window.open(u,'_blank','noopener')},openTelegramLink:function(u){window.open(u,'_blank','noopener')},HapticFeedback:{impactOccurred:function(){},notificationOccurred:function(){},selectionChanged:function(){}},setResizeAnchor:function(){},watchPublicData:function(){},unwatchPublicData:function(){},contentSafeAreaInset:{bottom:0,cornerLeft:0,cornerRight:0},wallet:null};document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(a){e.preventDefault();W.openLink(a.href)}},true);window.TelegramWidget=W;})()</script>`
}

function harnessHtml() {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Telegram Widget Preview</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#eef0f3;color:#111;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;gap:18px;padding:28px}h1{margin:0;font-size:18px;font-weight:600}p{margin:0;color:#6b7280;font-size:13px}.bar{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}.bar button{border:1px solid #d6d9de;background:#fff;border-radius:9px;padding:7px 12px;font:inherit;font-size:13px;cursor:pointer}.bar button.active{background:#111;border-color:#111;color:#fff}.frame{width:378px;max-width:100%;padding:9px;border-radius:24px;background:#fff;box-shadow:0 18px 50px rgba(15,23,42,.16),0 2px 8px rgba(15,23,42,.08)}iframe{display:block;width:360px;height:540px;max-width:100%;border:0;border-radius:18px;background:#fff}footer{font-size:12px;color:#8a919c}
</style><body><h1>Telegram Widget Preview</h1><p>真实纯逻辑 + 本地 fake TelegramWidget。点击卡片内按钮；刷新会重置示例数据。</p><div class="bar"><button id="light" class="active" onclick="theme('light')">Light</button><button id="dark" onclick="theme('dark')">Dark</button><button onclick="reload()">重置</button></div><div class="frame"><iframe id="frame" src="/widget"></iframe></div><footer>360 × auto · 15s 背景刷新 · 无内部滚动</footer><script>var f=document.getElementById('frame'),cur='light';f.onload=function(){try{var d=f.contentDocument;var h=d&&d.body?d.body.scrollHeight:0;if(h)f.style.height=Math.max(420,h)+'px'}catch(e){}};function theme(t){cur=t;document.getElementById('light').className=t==='light'?'active':'';document.getElementById('dark').className=t==='dark'?'active':'';f.src='/widget?theme='+t}function reload(){f.src='/widget?theme='+cur}</script></body></html>`
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () =>
      resolve(Buffer.concat(chunks).toString('utf8')),
    )
    request.on('error', reject)
  })
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
) {
  const url = new URL(
    request.url ?? '/',
    'http://localhost:8787',
  )

  if (url.pathname === '/widget') {
    await reset()
    const theme =
      url.searchParams.get('theme') === 'dark' ? 'dark' : 'light'
    const html = readFileSync(
      new URL('../src/server/telegram/widget.html', import.meta.url),
      'utf8',
    )
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    })
    response.end(
      `<!doctype html><meta charset="utf-8">${stubScript(theme, initialChatData)}${html}`,
    )
    return
  }

  if (
    url.pathname === '/preview/request' &&
    request.method === 'POST'
  ) {
    const body = await readBody(request)
    let data = ''
    try {
      const parsed = JSON.parse(body) as { data?: unknown }
      data = typeof parsed.data === 'string' ? parsed.data : ''
    } catch {
      data = ''
    }
    const result = await handleRequest(data)
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
    })
    response.end(JSON.stringify(result))
    return
  }

  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(harnessHtml())
}

const port = Number(process.env.PREVIEW_PORT ?? 8787)
const server = createServer((request, response) => {
  void route(request, response).catch((error) => {
    console.error('[asms] preview failed', error)
    if (!response.headersSent) {
      response.writeHead(500, {
        'content-type': 'text/plain; charset=utf-8',
      })
    }
    response.end('Preview failed')
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(
    `[asms] Telegram widget preview: http://127.0.0.1:${port}`,
  )
})
