import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { asUser } from '../session'
import {
  createMailbox,
  deleteMailbox,
  domainsForUser,
  listMailboxes,
  renewTempMailbox,
} from '../services/mailboxes'

export const listMailboxesFn = createServerFn({ method: 'GET' }).handler(
  async () => asUser(({ user }) => listMailboxes(user.id)),
)

export const listDomainsFn = createServerFn({ method: 'GET' }).handler(
  async () => asUser(() => domainsForUser()),
)

export const createMailboxFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      localPart: z.string().min(1).max(64),
      domainId: z.string().optional(),
      kind: z.enum(['permanent', 'temporary']),
      displayName: z.string().max(80).optional(),
    }),
  )
  .handler(async ({ data }) =>
    asUser(({ user }) =>
      createMailbox({
        userId: user.id,
        role: user.role ?? 'user',
        localPart: data.localPart,
        domainId: data.domainId,
        kind: data.kind,
        displayName: data.displayName,
      }),
    ),
  )

export const renewMailboxFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) =>
    asUser(({ user }) => renewTempMailbox(user.id, data.id)),
  )

export const deleteMailboxFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) =>
    asUser(async ({ user }) => {
      await deleteMailbox(user.id, data.id)
      return { deleted: true }
    }),
  )
