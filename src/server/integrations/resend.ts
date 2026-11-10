import { Resend } from 'resend'

import { AppError } from '../result'
import { getSetting } from '../settings'

let cached: { apiKey: string; client: Resend } | null = null
let chain: Promise<unknown> = Promise.resolve()
let lastCallAt = 0

export async function getResend(): Promise<Resend> {
  const apiKey =
    (await getSetting('resend.apiKey')) || process.env.RESEND_API_KEY || ''
  if (!apiKey) {
    throw new AppError(
      'RESEND_NOT_CONFIGURED',
      '尚未配置 Resend API Key，请先在管理面板完成配置',
    )
  }
  if (!cached || cached.apiKey !== apiKey) {
    cached = { apiKey, client: new Resend(apiKey) }
  }
  return cached.client
}

export async function getWebhookSecret(): Promise<string> {
  const stored = await getSetting('resend.webhookSecret')
  return stored || process.env.RESEND_WEBHOOK_SECRET || ''
}

const RESEND_TIMEOUT_MS = 15_000

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(new AppError('RESEND_TIMEOUT', 'Resend 请求超时，请稍后重试')),
        RESEND_TIMEOUT_MS,
      )
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/**
 * Resend allows ~2 requests/second per team. Serialize outbound calls with a
 * small gap so a burst of sends does not turn into 429s. A hung request must
 * not stall every later send, so each call also has a deadline.
 */
export function enqueueResend<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const wait = lastCallAt + 550 - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastCallAt = Date.now()
    return withTimeout(fn())
  })
  chain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

export function resetResendClient() {
  cached = null
}
