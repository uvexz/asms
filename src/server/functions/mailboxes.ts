import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { asUser } from '../session'
import {
  MAX_TEMP_MAILBOXES,
  createMailbox,
  deleteMailbox,
  domainsForUser,
  listMailboxes,
  renewTempMailbox,
} from '../services/mailboxes'
import { getMailPolicy, getSetting } from '../settings'

export const listMailboxesFn = createServerFn({ method: 'GET' }).handler(
  async () => asUser(({ user }) => listMailboxes(user.id)),
)

export const listDomainsFn = createServerFn({ method: 'GET' }).handler(
  async () => asUser(() => domainsForUser()),
)

/** The subset of the admin mail policy the client needs to phrase its own
 *  limits. Reserved prefixes stay server-side. */
export const fetchMailPolicyFn = createServerFn({ method: 'GET' }).handler(
  async () =>
    asUser(async ({ user }) => {
      const [policy, timezone] = await Promise.all([
        getMailPolicy(),
        getSetting('site.timezone'),
      ])
      return {
        minPrefixPermanent: policy.minPrefixPermanent,
        minPrefixTemp: policy.minPrefixTemp,
        maxPrefixLength: policy.maxPrefixLength,
        tempTtlMinutes: policy.tempTtlMinutes,
        tempMaxLifetimeMinutes: policy.tempMaxLifetimeMinutes,
        permanentCooldownDays: policy.permanentCooldownDays,
        maxPermanentMailboxes: policy.maxPermanentMailboxes,
        maxTempMailboxes: MAX_TEMP_MAILBOXES,
        dailySendLimit: policy.dailySendLimit,
        allowTempSending: policy.allowTempSending,
        timezone,
        isAdmin: user.role === 'admin',
      }
    }),
)

export const createMailboxFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      localPart: z.string().min(1).max(64),
      domainId: z.string().max(128).optional(),
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
  .validator(z.object({ id: z.string().max(128) }))
  .handler(async ({ data }) =>
    asUser(({ user }) => renewTempMailbox(user.id, data.id)),
  )

export const deleteMailboxFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().max(128) }))
  .handler(async ({ data }) =>
    asUser(async ({ user }) => {
      await deleteMailbox(user.id, data.id)
      return { deleted: true }
    }),
  )
