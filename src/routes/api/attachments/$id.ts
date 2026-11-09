import { createFileRoute } from '@tanstack/react-router'

import { getResend } from '#/server/integrations/resend'
import { getDownloadUrl } from '#/server/integrations/storage'
import { getAttachmentForUser } from '#/server/services/messages'
import { getSession } from '#/server/session'

export const Route = createFileRoute('/api/attachments/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const session = await getSession()
        if (!session) {
          return new Response('Unauthorized', { status: 401 })
        }

        try {
          const row = await getAttachmentForUser(session.user.id, params.id)
          const attachment = row.attachment

          if (attachment.stored && attachment.storageKey) {
            const url = await getDownloadUrl(
              attachment.storageKey,
              attachment.filename,
            )
            return new Response(null, {
              status: 302,
              headers: { Location: url },
            })
          }

          if (attachment.resendAttachmentId) {
            const resend = await getResend()
            const result = await resend.emails.receiving.attachments.get({
              emailId: row.message.resendEmailId,
              id: attachment.resendAttachmentId,
            })
            if (result.data?.download_url) {
              return new Response(null, {
                status: 302,
                headers: { Location: result.data.download_url },
              })
            }
          }

          return new Response('附件内容不可用', { status: 404 })
        } catch (error) {
          console.error('[asms] attachment download failed', error)
          return new Response('附件不存在', { status: 404 })
        }
      },
    },
  },
})
