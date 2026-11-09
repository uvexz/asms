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

export const Route = createFileRoute('/api/webhooks/resend')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.text()
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
