import { Resend } from 'resend'

import { AppError } from '../result'
import { getSetting } from '../settings'

let cached: { apiKey: string; client: Resend } | null = null
let chain: Promise<unknown> = Promise.resolve()
let lastCallAt = 0

export async function isResendConfigured(): Promise<boolean> {
  return Boolean(
    (await getSetting('resend.apiKey')) || process.env.RESEND_API_KEY,
  )
}

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

/**
 * Resend allows ~2 requests/second per team. Serialize outbound calls with a
 * small gap so a burst of sends does not turn into 429s.
 */
export function enqueueResend<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(async () => {
    const wait = lastCallAt + 550 - Date.now()
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    lastCallAt = Date.now()
    return fn()
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
