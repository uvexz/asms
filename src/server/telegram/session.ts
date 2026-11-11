import type { SessionRef, TelegramSessionState, WidgetView } from './types'

export const MAX_WIDGETS = 5
export const MAX_REFS = 200

export function defaultSessionState(): TelegramSessionState {
  return {
    v: 1,
    activeMailboxId: null,
    refs: { next: 1, items: {} },
    widgets: {},
  }
}

export function defaultWidgetView(now = Date.now()): WidgetView {
  return {
    view: 'home',
    page: 0,
    mailboxPage: 0,
    openId: null,
    error: '',
    seq: 0,
    lastChatData: null,
    updatedAt: now,
  }
}

function nonNegative(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback
}

export function parseSessionState(json: string): TelegramSessionState | null {
  try {
    const value = JSON.parse(json) as Record<string, unknown>
    if (!value || value.v !== 1) return null

    const state = defaultSessionState()
    state.activeMailboxId =
      typeof value.activeMailboxId === 'string' ? value.activeMailboxId : null

    const refs = value.refs as Record<string, unknown> | undefined
    state.refs.next = Math.max(1, nonNegative(refs?.next, 1))
    const items = refs?.items as Record<string, unknown> | undefined
    if (items) {
      for (const [ref, raw] of Object.entries(items)) {
        if (!/^r\d+$/.test(ref) || !raw || typeof raw !== 'object') continue
        const item = raw as Record<string, unknown>
        if (
          typeof item.id !== 'string' ||
          (item.k !== 'mailbox' && item.k !== 'message')
        ) {
          continue
        }
        state.refs.items[ref] = {
          id: item.id,
          k: item.k,
          t: nonNegative(item.t),
        }
      }
    }

    const widgets = value.widgets as Record<string, unknown> | undefined
    if (widgets) {
      for (const [messageId, raw] of Object.entries(widgets)) {
        if (!/^\d+$/.test(messageId) || !raw || typeof raw !== 'object') {
          continue
        }
        const widget = raw as Record<string, unknown>
        if (widget.view !== 'home' && widget.view !== 'mail') continue
        state.widgets[messageId] = {
          view: widget.view,
          page: nonNegative(widget.page),
          mailboxPage: nonNegative(widget.mailboxPage),
          openId: typeof widget.openId === 'string' ? widget.openId : null,
          error:
            typeof widget.error === 'string' ? widget.error.slice(0, 32) : '',
          seq: nonNegative(widget.seq),
          lastChatData:
            typeof widget.lastChatData === 'string'
              ? widget.lastChatData
              : null,
          updatedAt: nonNegative(widget.updatedAt, Date.now()),
        }
      }
    }

    return state
  } catch {
    return null
  }
}

export function serializeSessionState(state: TelegramSessionState): string {
  return JSON.stringify(state)
}

function pruneWidgets(
  state: TelegramSessionState,
  keep: string,
  max = MAX_WIDGETS,
) {
  const keys = Object.keys(state.widgets)
  if (keys.length <= max) return
  const removable = keys
    .filter((key) => key !== keep)
    .sort(
      (a, b) =>
        (state.widgets[a]?.updatedAt ?? 0) - (state.widgets[b]?.updatedAt ?? 0),
    )
  while (Object.keys(state.widgets).length > max && removable.length > 0) {
    const key = removable.shift()
    if (key) delete state.widgets[key]
  }
}

export function ensureWidget(
  state: TelegramSessionState,
  messageId: number | string,
  now = Date.now(),
): WidgetView {
  const key = String(messageId)
  let widget = state.widgets[key]
  if (!widget) {
    widget = defaultWidgetView(now)
    state.widgets[key] = widget
  }
  widget.updatedAt = now
  pruneWidgets(state, key)
  return widget
}

export function allocRef(
  state: TelegramSessionState,
  realId: string,
  kind: SessionRef['k'],
  now: number,
): string {
  for (const [ref, item] of Object.entries(state.refs.items)) {
    if (item.id === realId && item.k === kind) {
      item.t = now
      return ref
    }
  }
  const ref = `r${state.refs.next++}`
  state.refs.items[ref] = { id: realId, k: kind, t: now }
  return ref
}

export function resolveRef(
  state: TelegramSessionState,
  ref: string,
  kind: SessionRef['k'],
): string | null {
  const item = state.refs.items[ref]
  if (!item || item.k !== kind) return null
  item.t = Date.now()
  return item.id
}

export function pruneRefs(state: TelegramSessionState, max = MAX_REFS): void {
  const entries = Object.entries(state.refs.items)
  if (entries.length <= max) return
  entries.sort((a, b) => a[1].t - b[1].t)
  for (const [ref] of entries.slice(0, entries.length - max)) {
    delete state.refs.items[ref]
  }
}
