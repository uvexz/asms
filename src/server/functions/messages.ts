import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { asUser } from '../session'
import {
  deleteMessage,
  getMessage,
  listMessages,
  markAllRead,
  markMessage,
} from '../services/messages'

export const listMessagesFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      mailboxId: z.string().optional(),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(50).optional(),
      unreadOnly: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) =>
    asUser(({ user }) => listMessages({ userId: user.id, ...data })),
  )

export const getMessageFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) =>
    asUser(({ user }) => getMessage(user.id, data.id)),
  )

export const markMessageFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string(),
      isRead: z.boolean().optional(),
      isStarred: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) =>
    asUser(async ({ user }) => {
      await markMessage(user.id, data.id, {
        isRead: data.isRead,
        isStarred: data.isStarred,
      })
      return { updated: true }
    }),
  )

export const markAllReadFn = createServerFn({ method: 'POST' })
  .validator(z.object({ mailboxId: z.string() }))
  .handler(async ({ data }) =>
    asUser(async ({ user }) => {
      await markAllRead(user.id, data.mailboxId)
      return { updated: true }
    }),
  )

export const deleteMessageFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) =>
    asUser(async ({ user }) => {
      await deleteMessage(user.id, data.id)
      return { deleted: true }
    }),
  )
