import { AppError } from '../result'
import { getSetting } from '../settings'
import { enqueueResend, getResend } from '../integrations/resend'

export async function sendSystemMail(input: {
  to: string
  subject: string
  text: string
  html?: string
}) {
  const [storedKey, fromAddress, fromName] = await Promise.all([
    getSetting('resend.apiKey'),
    getSetting('resend.systemFromAddress'),
    getSetting('resend.fromName'),
  ])
  const apiKey = storedKey || process.env.RESEND_API_KEY || ''

  if (!apiKey) {
    throw new AppError('RESEND_NOT_CONFIGURED', '尚未配置 Resend API Key')
  }
  if (!fromAddress) {
    throw new AppError('SYSTEM_SENDER_NOT_CONFIGURED', '尚未配置系统发件地址')
  }

  const resend = await getResend()
  const { error } = await enqueueResend(() =>
    resend.emails.send({
      from: `${fromName} <${fromAddress}>`,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      ...(input.html ? { html: input.html } : {}),
    }),
  )

  if (error) {
    throw new AppError('SYSTEM_MAIL_FAILED', error.message)
  }
}
