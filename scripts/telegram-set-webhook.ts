import { existsSync } from 'node:fs'

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file)
}

const { getTelegramConfig } = await import(
  '#/server/telegram/config'
)
const { TelegramApi } = await import('#/server/telegram/api')

const config = getTelegramConfig()
if (!config) {
  console.error(
    '[asms] TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are required',
  )
  process.exit(1)
}

const api = new TelegramApi(config)
const command = process.argv[2] ?? 'info'
const dropPending = process.argv.includes('--drop')
const url =
  process.env.TELEGRAM_WEBHOOK_URL?.trim() ||
  `${config.baseUrl}/api/telegram/webhook`

try {
  if (command === 'set') {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new Error('TELEGRAM_WEBHOOK_URL is not a valid URL')
    }
    if (parsed.protocol !== 'https:') {
      throw new Error(
        'Telegram requires an https webhook URL; use bot:poll for local development',
      )
    }
    const ok = await api.setWebhook({
      url,
      secret_token: config.webhookSecret,
      allowed_updates: ['message', 'widget_query'],
      drop_pending_updates: dropPending,
    })
    console.log(`[asms] webhook set to ${url} (${ok})`)
  } else if (command === 'delete') {
    const ok = await api.deleteWebhook({
      drop_pending_updates: dropPending,
    })
    console.log(`[asms] webhook deleted (${ok})`)
  } else if (command === 'info') {
    const info = await api.getWebhookInfo()
    console.log(JSON.stringify(info, null, 2))
  } else {
    console.error(
      'usage: bun run bot:webhook <set|info|delete> [--drop]',
    )
    process.exitCode = 1
  }
} catch (error) {
  console.error(
    '[asms] Telegram webhook command failed',
    error instanceof Error ? error.message : error,
  )
  process.exitCode = 1
}
