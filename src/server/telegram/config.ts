import type { TelegramConfig } from './types'

function intEnv(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function baseUrl() {
  return (process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').replace(
    /\/+$/,
    '',
  )
}

function botUsername() {
  const value = process.env.TELEGRAM_BOT_USERNAME?.trim()
    .replace(/^@/, '')
    .trim()
  if (!value) return null
  return /^[A-Za-z0-9_]{5,32}$/.test(value) ? value : null
}

/** Bot API + webhook configuration. Missing token/secret only disables the
 * webhook route; it must not break the rest of the app at import time. */
export function getTelegramConfig(): TelegramConfig | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim()
  if (!token || !webhookSecret) return null
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) return null

  return {
    token,
    webhookSecret,
    botUsername: botUsername(),
    baseUrl: baseUrl(),
    bodyPageChars: intEnv('TELEGRAM_BODY_PAGE_CHARS', 420, 100, 800),
    bodyPageBytes: intEnv('TELEGRAM_BODY_PAGE_BYTES', 700, 100, 900),
  }
}

/** The settings page only needs the public bot username and link base URL. */
export function getTelegramLinkConfig(): {
  botUsername: string
  baseUrl: string
} | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const username = botUsername()
  if (!token || !username) return null
  return { botUsername: username, baseUrl: baseUrl() }
}
