import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { asUser } from '../session'
import { getSentEmail, listSentEmails, sendMail } from '../services/send'
import { getSendUsage } from '../services/quota'
import { getSetting } from '../settings'

export const sendMailFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      mailboxId: z.string().max(128),
      to: z.array(z.string().max(320)).min(1).max(10),
      cc: z.array(z.string().max(320)).max(10).optional(),
      bcc: z.array(z.string().max(320)).max(10).optional(),
      subject: z.string().max(200),
      text: z.string().max(100_000),
      requestId: z.string().uuid(),
    }),
  )
  .handler(async ({ data }) =>
    asUser(({ user }) =>
      sendMail({
        userId: user.id,
        role: user.role ?? 'user',
        ...data,
      }),
    ),
  )

export const listSentFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      page: z.number().int().min(1).max(1000).optional(),
      pageSize: z.number().int().min(1).max(50).optional(),
    }),
  )
  .handler(async ({ data }) =>
    asUser(({ user }) => listSentEmails({ userId: user.id, ...data })),
  )

export const getSentFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().max(128) }))
  .handler(async ({ data }) =>
    asUser(({ user }) => getSentEmail(user.id, data.id)),
  )

export const sendUsageFn = createServerFn({ method: 'GET' }).handler(async () =>
  asUser(async ({ user }) => {
    const timeZone = await getSetting('site.timezone')
    return getSendUsage({
      userId: user.id,
      role: user.role ?? 'user',
      timeZone,
    })
  }),
)
