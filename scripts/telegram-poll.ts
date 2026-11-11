import { existsSync, readFileSync } from 'node:fs'

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) process.loadEnvFile(file)
}

const { getTelegramConfig } = await import(
  '#/server/telegram/config'
)
const { TelegramApi } = await import('#/server/telegram/api')
const { handleTelegramUpdate } = await import(
  '#/server/telegram/handler'
)
const { claimUpdate, completeUpdate, releaseUpdate } = await import(
  '#/server/telegram/store'
)

const config = getTelegramConfig()
if (!config) {
  console.error(
    '[asms] TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET are required',
  )
  process.exit(1)
}

const widgetHtml = readFileSync(
  new URL('../src/server/telegram/widget.html', import.meta.url),
  'utf8',
)
const api = new TelegramApi(config)

const me = await api.getMe()
console.log(
  `[asms] Telegram polling as @${me.username ?? me.id}`,
)

const webhook = await api.getWebhookInfo().catch(() => null)
if (webhook?.url) {
  console.error(
    `[asms] a webhook is already set (${webhook.url}); ` +
      'run `bun run bot:webhook delete` before polling',
  )
  process.exit(1)
}

let offset = 0
const pending = await api
  .getUpdates({
    offset: -1,
    timeout: 0,
    allowed_updates: ['message', 'widget_query'],
  })
  .catch(() => [])
if (pending.length > 0) {
  offset = pending[pending.length - 1].update_id + 1
}

let running = true
process.on('SIGINT', () => {
  running = false
})
process.on('SIGTERM', () => {
  running = false
})

function pause(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

while (running) {
  let updates
  try {
    updates = await api.getUpdates({
      offset,
      timeout: 30,
      allowed_updates: ['message', 'widget_query'],
    })
  } catch (error) {
    console.error(
      '[asms] Telegram getUpdates failed',
      error instanceof Error ? error.message : error,
    )
    await pause(2_000)
    continue
  }

  for (const update of updates) {
    offset = update.update_id + 1
    const claimed = await claimUpdate(update.update_id)
    if (!claimed) continue
    try {
      await handleTelegramUpdate(update, { widgetHtml })
      await completeUpdate(update.update_id)
    } catch (error) {
      console.error(
        '[asms] Telegram update failed',
        error instanceof Error ? error.message : error,
      )
      await releaseUpdate(update.update_id)
    }
  }
}

console.log('[asms] Telegram polling stopped')
