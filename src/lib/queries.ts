import { queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'

import { linkedAccountsFn } from '@/server/functions/account'
import {
  adminAuditFn,
  adminDomainsFn,
  adminIngestFn,
  adminMailboxesFn,
  adminOAuthFn,
  adminOverviewFn,
  adminSettingsFn,
  adminUsersFn,
} from '@/server/functions/admin'
import { fetchOverview } from '@/server/functions/dashboard'
import { listDomainsFn, listMailboxesFn } from '@/server/functions/mailboxes'
import { getMessageFn, listMessagesFn } from '@/server/functions/messages'
import { getSentFn, listSentFn, sendUsageFn } from '@/server/functions/send'

const SECOND = 1_000
const MINUTE = 60 * SECOND

/**
 * How long a cached answer stays good enough to paint without asking again.
 * Three tiers, because an inbox and a domain list want very different
 * answers, and a fourth number would only invite arguments.
 */
export const STALE_TIME = {
  /**
   * Mail arrives on its own. The poll is what keeps this fresh; the staleTime
   * only stops the remount burst when moving between panes.
   */
  live: 10 * SECOND,
  /** User data that changes only when the user does something. */
  user: 30 * SECOND,
  /** Reference data and admin configuration, read far more often than written. */
  reference: 5 * MINUTE,
} as const

/** How often a mounted view re-polls the server for data that arrives on its own. */
export const REFRESH_INTERVAL = {
  overview: 15 * SECOND,
  mailboxes: 30 * SECOND,
  messages: 15 * SECOND,
  adminOverview: 30 * SECOND,
} as const

/**
 * One key per server read, namespaced so a single `invalidateQueries` covers a
 * whole area. `['mail', …]` is everything the signed-in user owns; `['admin',
 * …]` everything behind the admin gate. Sibling keys never prefix-match each
 * other by accident: `'message'` is not `'messages'`, `'sent'` is not
 * `'sent-detail'`.
 */
export const queryKeys = {
  overview: ['mail', 'overview'] as const,
  mailboxes: ['mail', 'mailboxes'] as const,
  domains: ['mail', 'domains'] as const,
  messages: ['mail', 'messages'] as const,
  message: (id: string) => ['mail', 'message', id] as const,
  sent: ['mail', 'sent'] as const,
  sentDetail: (id: string) => ['mail', 'sent-detail', id] as const,
  sendUsage: ['mail', 'send-usage'] as const,
  linkedAccounts: ['mail', 'linked-accounts'] as const,

  adminOverview: ['admin', 'overview'] as const,
  adminUsers: ['admin', 'users'] as const,
  adminMailboxes: ['admin', 'mailboxes'] as const,
  adminDomains: ['admin', 'domains'] as const,
  adminSettings: ['admin', 'settings'] as const,
  adminOAuth: ['admin', 'oauth'] as const,
  adminAudit: ['admin', 'audit'] as const,
  adminIngest: ['admin', 'ingest'] as const,
} as const

/* -------------------------------------------------------------------------- */
/* User mail                                                                   */
/* -------------------------------------------------------------------------- */

export function overviewQuery() {
  return queryOptions({
    queryKey: queryKeys.overview,
    queryFn: () => fetchOverview(),
    staleTime: STALE_TIME.live,
    refetchInterval: REFRESH_INTERVAL.overview,
  })
}

/**
 * No poll here on purpose: the three-pane view wants a live rail, but the
 * compose screen uses the same query only to fill a picker and must not poll
 * while someone is writing. The mailbox page adds its own interval.
 */
export function mailboxesQuery() {
  return queryOptions({
    queryKey: queryKeys.mailboxes,
    queryFn: () => listMailboxesFn(),
    staleTime: STALE_TIME.user,
  })
}

export function domainsQuery() {
  return queryOptions({
    queryKey: queryKeys.domains,
    queryFn: () => listDomainsFn(),
    staleTime: STALE_TIME.reference,
  })
}

export function messagesQuery(input: {
  mailboxId?: string
  page: number
  pageSize: number
}) {
  return queryOptions({
    queryKey: [
      ...queryKeys.messages,
      {
        mailboxId: input.mailboxId ?? null,
        page: input.page,
        pageSize: input.pageSize,
      },
    ],
    queryFn: () =>
      listMessagesFn({
        data: {
          mailboxId: input.mailboxId,
          page: input.page,
          pageSize: input.pageSize,
        },
      }),
    staleTime: STALE_TIME.live,
    refetchInterval: REFRESH_INTERVAL.messages,
  })
}

/** A delivered message body never changes, so it is worth keeping around. */
export function messageQuery(id: string | null | undefined) {
  return queryOptions({
    queryKey: queryKeys.message(id ?? 'none'),
    queryFn: () => getMessageFn({ data: { id: id! } }),
    enabled: Boolean(id),
    staleTime: STALE_TIME.reference,
  })
}

export function sentQuery(page: number) {
  return queryOptions({
    queryKey: [...queryKeys.sent, page],
    queryFn: () => listSentFn({ data: { page, pageSize: 20 } }),
    staleTime: STALE_TIME.user,
  })
}

export function sentDetailQuery(id: string | null) {
  return queryOptions({
    queryKey: queryKeys.sentDetail(id ?? 'none'),
    queryFn: () => getSentFn({ data: { id: id! } }),
    enabled: Boolean(id),
    staleTime: STALE_TIME.reference,
  })
}

export function sendUsageQuery() {
  return queryOptions({
    queryKey: queryKeys.sendUsage,
    queryFn: () => sendUsageFn(),
    staleTime: STALE_TIME.user,
  })
}

export function linkedAccountsQuery() {
  return queryOptions({
    queryKey: queryKeys.linkedAccounts,
    queryFn: () => linkedAccountsFn(),
    staleTime: STALE_TIME.user,
  })
}

/* -------------------------------------------------------------------------- */
/* Admin                                                                       */
/* -------------------------------------------------------------------------- */

export function adminOverviewQuery() {
  return queryOptions({
    queryKey: queryKeys.adminOverview,
    queryFn: () => adminOverviewFn(),
    staleTime: STALE_TIME.live,
    refetchInterval: REFRESH_INTERVAL.adminOverview,
  })
}

export function adminUsersQuery(input: { search: string; page: number }) {
  return queryOptions({
    queryKey: [...queryKeys.adminUsers, input],
    queryFn: () =>
      adminUsersFn({
        data: { search: input.search || undefined, page: input.page },
      }),
    staleTime: STALE_TIME.user,
  })
}

export function adminMailboxesQuery(input: {
  kind?: 'permanent' | 'temporary'
  page: number
}) {
  return queryOptions({
    queryKey: [...queryKeys.adminMailboxes, input],
    queryFn: () =>
      adminMailboxesFn({ data: { kind: input.kind, page: input.page } }),
    staleTime: STALE_TIME.user,
  })
}

export function adminDomainsQuery() {
  return queryOptions({
    queryKey: queryKeys.adminDomains,
    queryFn: () => adminDomainsFn(),
    staleTime: STALE_TIME.user,
  })
}

export function adminSettingsQuery() {
  return queryOptions({
    queryKey: queryKeys.adminSettings,
    queryFn: () => adminSettingsFn(),
    staleTime: STALE_TIME.reference,
  })
}

export function adminOAuthQuery() {
  return queryOptions({
    queryKey: queryKeys.adminOAuth,
    queryFn: () => adminOAuthFn(),
    staleTime: STALE_TIME.reference,
  })
}

export function adminAuditQuery(page: number) {
  return queryOptions({
    queryKey: [...queryKeys.adminAudit, page],
    queryFn: () => adminAuditFn({ data: { page } }),
    staleTime: STALE_TIME.user,
  })
}

export function adminIngestQuery(page: number) {
  return queryOptions({
    queryKey: [...queryKeys.adminIngest, page],
    queryFn: () => adminIngestFn({ data: { page } }),
    staleTime: STALE_TIME.user,
  })
}

/* -------------------------------------------------------------------------- */
/* Types shared with the pages that patch the cache in place                   */
/* -------------------------------------------------------------------------- */

/** The page payload `listMessagesFn` resolves to, sans the `Result` wrapper. */
export type MessagePage = Extract<
  Awaited<ReturnType<typeof listMessagesFn>>,
  { ok: true }
>['data']

/** The detail payload `getMessageFn` resolves to, sans the `Result` wrapper. */
export type MessageDetail = Extract<
  Awaited<ReturnType<typeof getMessageFn>>,
  { ok: true }
>['data']

/* -------------------------------------------------------------------------- */
/* Invalidation                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A mailbox or a message changed. Unread badges, the mailbox rail and every
 * open list move together, so they are invalidated as one set — this is the
 * only place that decides which three keys a mail write touches.
 */
export function invalidateMailData(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.messages }),
    client.invalidateQueries({ queryKey: queryKeys.mailboxes }),
    client.invalidateQueries({ queryKey: queryKeys.overview }),
  ])
}

/** A message went out: today's quota, the sent log and the overview counters. */
export function invalidateAfterSend(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.sendUsage }),
    client.invalidateQueries({ queryKey: queryKeys.sent }),
    client.invalidateQueries({ queryKey: queryKeys.overview }),
  ])
}

/**
 * A domain was added, verified or removed. The admin list, the user-facing
 * picker and the overview summary all read from the same table.
 */
export function invalidateDomains(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.adminDomains }),
    client.invalidateQueries({ queryKey: queryKeys.domains }),
    client.invalidateQueries({ queryKey: queryKeys.adminOverview }),
  ])
}

/**
 * Settings were saved. The admin form and the shell both read the same rows;
 * the shell lives in the router context, so the caller still runs
 * `router.invalidate()` after this to re-read the branding.
 */
export function invalidateSettings(client: QueryClient) {
  return client.invalidateQueries({ queryKey: queryKeys.adminSettings })
}
