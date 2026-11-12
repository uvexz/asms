import { timingSafeEqual } from 'node:crypto'

import { createFileRoute } from '@tanstack/react-router'

import { getTelegramConfig } from '#/server/telegram/config'
import { handleTelegramUpdate } from '#/server/telegram/handler'
import {
  claimUpdate,
  completeUpdate,
  pruneUpdates,
  releaseUpdate,
} from '#/server/telegram/store'
import type { TelegramUpdate } from '#/server/telegram/types'
import widgetHtml from '#/server/telegram/widget.html?raw'

const MAX_BYTES = 64 * 1024
const NO_STORE = { 'cache-control': 'no-store' }
const PRUNE_EVERY = 6 * 60 * 60_000
// Boot is not a reason to run housekeeping: a fresh process starts its window
// now, so the first user request only pays for its own work.
let lastPrune = Date.now()

function secretMatches(expected: string, received: string) {
  const a = Buffer.from(expected)
  const b = Buffer.from(received)
  return a.length === b.length && timingSafeEqual(a, b)
}

export const Route = createFileRoute('/api/telegram/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const config = getTelegramConfig()
        if (!config) {
          return new Response('Telegram bot is not configured', {
            status: 503,
            headers: NO_STORE,
          })
        }

        const secret =
          request.headers.get('x-telegram-bot-api-secret-token') ?? ''
        if (!secretMatches(config.webhookSecret, secret)) {
          return new Response('Unauthorized', {
            status: 401,
            headers: NO_STORE,
          })
        }

        const declared = Number(request.headers.get('content-length') ?? '')
        if (Number.isFinite(declared) && declared > MAX_BYTES) {
          return new Response('Payload too large', {
            status: 413,
            headers: NO_STORE,
          })
        }

        const body = await request.text()
        if (Buffer.byteLength(body, 'utf8') > MAX_BYTES) {
          return new Response('Payload too large', {
            status: 413,
            headers: NO_STORE,
          })
        }

        let update: TelegramUpdate
        try {
          update = JSON.parse(body) as TelegramUpdate
        } catch {
          return new Response('Invalid JSON', {
            status: 400,
            headers: NO_STORE,
          })
        }
        if (!update || typeof update.update_id !== 'number') {
          return new Response('Invalid update', {
            status: 400,
            headers: NO_STORE,
          })
        }

        const claimed = await claimUpdate(update.update_id)
        if (!claimed) {
          return Response.json(
            { ok: true, duplicate: true },
            { headers: NO_STORE },
          )
        }

        try {
          await handleTelegramUpdate(update, { widgetHtml })
          await completeUpdate(update.update_id)
          // Housekeeping rides after the answer: the update table is only
          // read for idempotency, so nothing above waits on it.
          if (Date.now() - lastPrune > PRUNE_EVERY) {
            lastPrune = Date.now()
            await pruneUpdates().catch(() => undefined)
          }
          return Response.json({ ok: true }, { headers: NO_STORE })
        } catch (error) {
          console.error(
            '[asms] telegram webhook failed',
            error instanceof Error ? error.message : error,
          )
          await releaseUpdate(update.update_id)
          return new Response('Processing failed', {
            status: 500,
            headers: NO_STORE,
          })
        }
      },
      GET: async () =>
        new Response('Method Not Allowed', {
          status: 405,
          headers: { ...NO_STORE, allow: 'POST' },
        }),
    },
  },
})
