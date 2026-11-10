import { createFileRoute } from '@tanstack/react-router'
import { Resend } from 'resend'

import { getResend, getWebhookSecret } from '#/server/integrations/resend'
import { ingestReceivedEmail } from '#/server/services/ingest'
import { updateSentStatusByResendId } from '#/server/services/send'

type EventPayload = {
  type: string
  data?: { email_id?: string }
}

const STATUS_BY_EVENT: Record<string, string> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.delivery_delayed': 'delivery_delayed',
  'email.failed': 'failed',
}

const MAX_WEBHOOK_BYTES = 256 * 1024

/** Read at most `MAX_WEBHOOK_BYTES`; verification must not be a memory sink. */
async function readLimitedBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES) return null
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_WEBHOOK_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

export const Route = createFileRoute('/api/webhooks/resend')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await readLimitedBody(request)
        if (payload === null) {
          return new Response('Payload too large', { status: 413 })
        }

        const secret = await getWebhookSecret()

        if (!secret) {
          return new Response('Webhook secret is not configured', {
            status: 503,
          })
        }

        let event: EventPayload
        try {
          const client = await getResend().catch(() => new Resend('unused'))
          event = client.webhooks.verify({
            payload,
            headers: {
              id: request.headers.get('svix-id') ?? '',
              timestamp: request.headers.get('svix-timestamp') ?? '',
              signature: request.headers.get('svix-signature') ?? '',
            },
            webhookSecret: secret,
          }) as unknown as EventPayload
        } catch (error) {
          console.error('[asms] webhook verification failed', error)
          return new Response('Invalid signature', { status: 401 })
        }

        try {
          if (event.type === 'email.received') {
            await ingestReceivedEmail(
              event as unknown as Parameters<typeof ingestReceivedEmail>[0],
            )
          } else {
            const status = STATUS_BY_EVENT[event.type]
            const emailId = event.data?.email_id
            if (status && emailId) {
              await updateSentStatusByResendId(emailId, status)
            }
          }
        } catch (error) {
          console.error('[asms] webhook processing failed', error)
          return new Response('Processing failed', { status: 500 })
        }

        return Response.json({ received: true })
      },
    },
  },
})
