import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { asUser } from '../session'
import {
  deleteMessage,
  getMessage,
  listMessages,
  markMessage,
} from '../services/messages'

export const listMessagesFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      mailboxId: z.string().max(128).optional(),
      page: z.number().int().min(1).max(1000).optional(),
      pageSize: z.number().int().min(1).max(50).optional(),
      unreadOnly: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) =>
    asUser(({ user }) => listMessages({ userId: user.id, ...data })),
  )

export const getMessageFn = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().max(128) }))
  .handler(async ({ data }) =>
    asUser(({ user }) => getMessage(user.id, data.id)),
  )

export const markMessageFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().max(128),
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

export const deleteMessageFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().max(128) }))
  .handler(async ({ data }) =>
    asUser(async ({ user }) => {
      await deleteMessage(user.id, data.id)
      return { deleted: true }
    }),
  )
