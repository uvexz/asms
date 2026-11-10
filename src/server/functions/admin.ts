import { and, count, desc, eq, inArray, like, or } from 'drizzle-orm'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { db } from '#/db'
import {
  auditLogs,
  domains,
  ingestEvents,
  mailboxes,
  messages,
  oauthProviders,
  session,
  user,
} from '#/db/schema'
import { getEnabledProviderIds, resetAuthCache } from '#/lib/auth'
import {
  ENV_OIDC_PROVIDER,
  isOidcProvider,
  MANAGED_PROVIDERS,
  providerIssuer,
  providerScopes,
} from '#/lib/oauth-providers'
import { encryptSecret } from '../crypto'
import { asAdmin } from '../session'
import { AppError, assert } from '../result'
import {
  addDomain,
  listDomains,
  refreshDomain,
  removeDomain,
  setDefaultDomain,
  updateDomain,
  verifyDomain,
} from '../services/domains'
import { audit } from '../services/audit'
import { deleteMailboxAsAdmin } from '../services/mailboxes'
import { getResend, resetResendClient } from '../integrations/resend'
import { resetS3Client } from '../integrations/storage'
import {
  getAdminSettings,
  getSetting,
  invalidateSettings,
  SETTING_DEFS,
  setSetting,
} from '../settings'
import type { SettingKey } from '../settings'

type AdminCounts = {
  users: number
  permanent: number
  temporary: number
  messages: number
}

let adminCountsCache: { value: AdminCounts; expiresAt: number } | null = null

function invalidateAdminCounts() {
  adminCountsCache = null
}

async function getAdminCounts(): Promise<AdminCounts> {
  if (adminCountsCache && adminCountsCache.expiresAt > Date.now()) {
    return adminCountsCache.value
  }

  const [users, permanent, temporary, inbox] = await Promise.all([
    db.select({ value: count() }).from(user).get(),
    db
      .select({ value: count() })
      .from(mailboxes)
      .where(eq(mailboxes.kind, 'permanent'))
      .get(),
    db
      .select({ value: count() })
      .from(mailboxes)
      .where(eq(mailboxes.kind, 'temporary'))
      .get(),
    db.select({ value: count() }).from(messages).get(),
  ])

  const value = {
    users: users?.value ?? 0,
    permanent: permanent?.value ?? 0,
    temporary: temporary?.value ?? 0,
    messages: inbox?.value ?? 0,
  }
  adminCountsCache = { value, expiresAt: Date.now() + 30_000 }
  return value
}

export const adminOverviewFn = createServerFn({ method: 'GET' }).handler(
  async () =>
    asAdmin(async () => {
      const [counts, domainRows] = await Promise.all([
        getAdminCounts(),
        db
          .select({
            id: domains.id,
            name: domains.name,
            status: domains.status,
            isDefault: domains.isDefault,
          })
          .from(domains)
          .orderBy(desc(domains.createdAt)),
      ])

      return { ...counts, domains: domainRows }
    }),
)

export const adminSettingsFn = createServerFn({ method: 'GET' }).handler(
  async () =>
    asAdmin(async () => {
      const rows = await getAdminSettings()
      return {
        rows,
        keys: Object.keys(SETTING_DEFS),
      }
    }),
)

export const adminSaveSettingsFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      entries: z
        .array(z.object({ key: z.string().max(100), value: z.unknown() }))
        .min(1)
        .max(50),
    }),
  )
  .handler(async ({ data }) =>
    asAdmin(async ({ user: actor }) => {
      const disablingPassword = data.entries.some(
        (entry) =>
          entry.key === 'auth.emailPasswordEnabled' && entry.value === false,
      )
      if (disablingPassword) {
        const providers = await getEnabledProviderIds()
        if (providers.length === 0) {
          throw new AppError(
            'LAST_LOGIN_METHOD',
            '至少保留一种登录方式：请先启用一个第三方登录',
          )
        }
      }

      const changed: string[] = []
      await db.transaction(async (tx) => {
        for (const entry of data.entries) {
          if (!(entry.key in SETTING_DEFS)) continue
          await setSetting(entry.key as SettingKey, entry.value, actor.id, tx)
          changed.push(entry.key)
        }
      })

      invalidateSettings()
      resetResendClient()
      resetS3Client()

      if (changed.some((key) => key.startsWith('auth.'))) {
        resetAuthCache()
      }

      await audit({
        actorId: actor.id,
        action: 'settings.update',
        targetType: 'settings',
        meta: { keys: changed },
      })

      return { changed }
    }),
  )

export const adminTestResendFn = createServerFn({ method: 'POST' }).handler(
  async () =>
    asAdmin(async () => {
      const resend = await getResend()
      const result = await resend.domains.list({ limit: 1 })
      if (result.error) {
        throw new AppError('RESEND_TEST_FAILED', result.error.message)
      }
      return {
        ok: true,
        domains: result.data?.data.length ?? 0,
      }
    }),
)

export const adminUsersFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      search: z.string().max(100).optional(),
      page: z.number().int().min(1).max(1000).optional(),
    }),
  )
  .handler(async ({ data }) =>
    asAdmin(async () => {
      const page = Math.max(1, data.page ?? 1)
      const pageSize = 20
      const search = data.search?.trim()
      const where = search
        ? or(like(user.email, `%${search}%`), like(user.name, `%${search}%`))
        : undefined

      const [rows, totalRow] = await Promise.all([
        db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            banned: user.banned,
            createdAt: user.createdAt,
          })
          .from(user)
          .where(where)
          .orderBy(desc(user.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ value: count() }).from(user).where(where).get(),
      ])

      const ids = rows.map((row) => row.id)
      const mailboxCounts =
        ids.length > 0
          ? await db
              .select({ userId: mailboxes.userId, value: count() })
              .from(mailboxes)
              .where(inArray(mailboxes.userId, ids))
              .groupBy(mailboxes.userId)
          : []

      const mailboxMap = new Map(
        mailboxCounts.map((row) => [row.userId, row.value]),
      )

      return {
        items: rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          mailboxes: mailboxMap.get(row.id) ?? 0,
        })),
        total: totalRow?.value ?? 0,
        page,
      }
    }),
  )

export const adminSetRoleFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      userId: z.string().max(128),
      role: z.enum(['user', 'admin']),
    }),
  )
  .handler(async ({ data }) =>
    asAdmin(async ({ user: actor }) => {
      if (data.userId === actor.id && data.role !== 'admin') {
        throw new AppError('SELF_DEMOTE', '不能取消自己的管理员权限')
      }
      if (data.role === 'user') {
        const admins =
          (
            await db
              .select({ value: count() })
              .from(user)
              .where(eq(user.role, 'admin'))
              .get()
          )?.value ?? 0
        assert(admins > 1, 'LAST_ADMIN', '至少保留一名管理员')
      }

      await db
        .update(user)
        .set({ role: data.role, updatedAt: new Date() })
        .where(eq(user.id, data.userId))

      await audit({
        actorId: actor.id,
        action: 'user.role',
        targetType: 'user',
        targetId: data.userId,
        meta: { role: data.role },
      })

      resetAuthCache()
      return { updated: true }
    }),
  )

export const adminBanUserFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      userId: z.string().max(128),
      banned: z.boolean(),
      reason: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ data }) =>
    asAdmin(async ({ user: actor }) => {
      if (data.userId === actor.id) {
        throw new AppError('SELF_BAN', '不能封禁自己')
      }
      await db
        .update(user)
        .set({
          banned: data.banned,
          banReason: data.banned ? (data.reason ?? '违反使用条款') : null,
          // A stale expiry from an earlier ban must not auto-unban the user on
          // their next session.
          banExpires: null,
          updatedAt: new Date(),
        })
        .where(eq(user.id, data.userId))

      if (data.banned) {
        // The custom server functions check `user.banned`, but existing
        // sessions also reach Better Auth endpoints and the attachment route.
        // Revoke them at the source, exactly like the admin plugin's banUser.
        await db.delete(session).where(eq(session.userId, data.userId))
      }

      await audit({
        actorId: actor.id,
        action: data.banned ? 'user.ban' : 'user.unban',
        targetType: 'user',
        targetId: data.userId,
        meta: { reason: data.reason },
      })

      return { updated: true }
    }),
  )

export const adminMailboxesFn = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      search: z.string().max(100).optional(),
      kind: z.enum(['permanent', 'temporary']).optional(),
      page: z.number().int().min(1).max(1000).optional(),
    }),
  )
  .handler(async ({ data }) =>
    asAdmin(async () => {
      const page = Math.max(1, data.page ?? 1)
      const pageSize = 20
      const filters = []
      if (data.kind) filters.push(eq(mailboxes.kind, data.kind))
      if (data.search?.trim()) {
        filters.push(like(mailboxes.localPart, `%${data.search.trim()}%`))
      }
      const where = filters.length > 0 ? and(...filters) : undefined

      const [rows, totalRow] = await Promise.all([
        db
          .select({
            id: mailboxes.id,
            localPart: mailboxes.localPart,
            kind: mailboxes.kind,
            status: mailboxes.status,
            expiresAt: mailboxes.expiresAt,
            createdAt: mailboxes.createdAt,
            domain: domains.name,
            ownerEmail: user.email,
            ownerId: user.id,
          })
          .from(mailboxes)
          .innerJoin(domains, eq(mailboxes.domainId, domains.id))
          .innerJoin(user, eq(mailboxes.userId, user.id))
          .where(where)
          .orderBy(desc(mailboxes.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ value: count() }).from(mailboxes).where(where).get(),
      ])

      return {
        items: rows.map((row) => ({
          ...row,
          address: `${row.localPart}@${row.domain}`,
          expiresAt: row.expiresAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
        })),
        total: totalRow?.value ?? 0,
        page,
      }
    }),
  )

export const adminDomainsFn = createServerFn({ method: 'GET' }).handler(
  async () => asAdmin(async () => ({ items: await listDomains() })),
)

export const adminAddDomainFn = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().min(3).max(253) }))
  .handler(async ({ data }) =>
    asAdmin(async ({ user: actor }) => {
      const row = await addDomain(data.name)
      await audit({
        actorId: actor.id,
        action: 'domain.add',
        targetType: 'domain',
        targetId: row.id,
        meta: { name: row.name },
      })
      return row
    }),
  )

export const adminVerifyDomainFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().max(128) }))
  .handler(async ({ data }) =>
    asAdmin(async ({ user: actor }) => {
      const result = await verifyDomain(data.id)
      await audit({
        actorId: actor.id,
        action: 'domain.verify',
        targetType: 'domain',
        targetId: data.id,
        meta: { status: result.status },
      })
      return result
    }),
  )

export const adminRefreshDomainFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().max(128) }))
  .handler(async ({ data }) => asAdmin(async () => refreshDomain(data.id)))

export const adminSetDefaultDomainFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().max(128) }))
  .handler(async ({ data }) =>
    asAdmin(async ({ user: actor }) => {
      await setDefaultDomain(data.id)
      await audit({
        actorId: actor.id,
        action: 'domain.default',
        targetType: 'domain',
        targetId: data.id,
      })
      return { updated: true }
    }),
  )

export const adminUpdateDomainFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: z.string().max(128),
      sendingEnabled: z.boolean().optional(),
      receivingEnabled: z.boolean().optional(),
      temporaryEnabled: z.boolean().optional(),
    }),
  )
  .handler(async ({ data }) =>
    asAdmin(async ({ user: actor }) => {
      const { id, ...patch } = data
      await updateDomain(id, patch)
      await audit({
        actorId: actor.id,
        action: 'domain.update',
        targetType: 'domain',
        targetId: id,
        meta: patch,
      })
      return { updated: true }
    }),
  )

export const adminRemoveDomainFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().max(128) }))
  .handler(async ({ data }) =>
    asAdmin(async ({ user: actor }) => {
      await removeDomain(data.id)
      await audit({
        actorId: actor.id,
        action: 'domain.remove',
        targetType: 'domain',
        targetId: data.id,
      })
      return { deleted: true }
    }),
  )

export const adminDeleteMailboxFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().max(128) }))
  .handler(async ({ data }) =>
    asAdmin(async ({ user: actor }) => {
      const row = await deleteMailboxAsAdmin(data.id)
      invalidateAdminCounts()
      await audit({
        actorId: actor.id,
        action: 'mailbox.delete',
        targetType: 'mailbox',
        targetId: data.id,
        meta: { address: row.localPart },
      })
      return { deleted: true }
    }),
  )

export const adminOAuthFn = createServerFn({ method: 'GET' }).handler(
  async () =>
    asAdmin(async () => {
      const rows = await db.select().from(oauthProviders)
      const map = new Map(rows.map((row) => [row.provider, row]))
      const envOidc = Boolean(
        process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID,
      )

      return {
        items: MANAGED_PROVIDERS.map((provider) => {
          const row = map.get(provider)
          const oidc = isOidcProvider(provider)
          // The `OIDC_*` environment block stands in until a row exists.
          const fromEnv = provider === ENV_OIDC_PROVIDER && !row && envOidc
          return {
            provider,
            enabled: row?.enabled ?? fromEnv,
            clientId:
              row?.clientId ??
              (fromEnv ? (process.env.OIDC_CLIENT_ID ?? '') : ''),
            issuer:
              row?.issuer ??
              (fromEnv
                ? (process.env.OIDC_ISSUER ?? '')
                : oidc
                  ? (providerIssuer(provider) ?? '')
                  : ''),
            scopes:
              row?.scopes ??
              (fromEnv
                ? (process.env.OIDC_SCOPES ?? '')
                : oidc
                  ? providerScopes(provider)
                  : ''),
            hasSecret:
              Boolean(row?.clientSecretEnc) ||
              (fromEnv && Boolean(process.env.OIDC_CLIENT_SECRET)),
            source: row
              ? ('db' as const)
              : fromEnv
                ? ('env' as const)
                : ('none' as const),
          }
        }),
        callbackBase: `${process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'}/api/auth/callback`,
      }
    }),
)

export const adminSaveOAuthFn = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      provider: z.enum(MANAGED_PROVIDERS),
      enabled: z.boolean(),
      clientId: z.string().max(300),
      clientSecret: z.string().max(300).optional(),
      issuer: z.string().max(300).optional(),
      scopes: z.string().max(300).optional(),
    }),
  )
  .handler(async ({ data }) =>
    asAdmin(async ({ user: actor }) => {
      const oidc = isOidcProvider(data.provider)
      const issuer = normalizeIssuer(data.issuer)

      if (data.enabled && !data.clientId.trim()) {
        throw new AppError('OAUTH_CLIENT_ID_REQUIRED', '启用前请填写 Client ID')
      }
      if (!data.enabled) {
        const passwordEnabled = await getSetting('auth.emailPasswordEnabled')
        const usable = await getEnabledProviderIds()
        if (
          !passwordEnabled &&
          usable.includes(data.provider) &&
          usable.length === 1
        ) {
          throw new AppError(
            'LAST_LOGIN_METHOD',
            '这是最后一个可用的登录方式，请先启用其他方式',
          )
        }
      }
      if (oidc && data.enabled) {
        assert(issuer, 'OIDC_ISSUER_REQUIRED', '启用前请填写 Issuer')
        const url = parseUrl(issuer)
        assert(url, 'OIDC_ISSUER_INVALID', 'Issuer 需要是完整的 https 地址')
      }

      const existing = await db
        .select()
        .from(oauthProviders)
        .where(eq(oauthProviders.provider, data.provider))
        .get()

      const secretEnc = data.clientSecret?.trim()
        ? encryptSecret(data.clientSecret.trim())
        : (existing?.clientSecretEnc ?? envSecret(data.provider))

      if (data.enabled && !secretEnc) {
        throw new AppError(
          'OAUTH_CLIENT_SECRET_REQUIRED',
          '启用前请填写 Client Secret',
        )
      }

      const values = {
        enabled: data.enabled,
        clientId: data.clientId.trim(),
        clientSecretEnc: secretEnc,
        issuer: oidc ? issuer : null,
        scopes: oidc ? data.scopes?.trim() || null : null,
        updatedAt: new Date(),
      }

      await db
        .insert(oauthProviders)
        .values({ provider: data.provider, ...values })
        .onConflictDoUpdate({
          target: oauthProviders.provider,
          set: values,
        })

      resetAuthCache()
      await audit({
        actorId: actor.id,
        action: 'oauth.update',
        targetType: 'oauth',
        targetId: data.provider,
        meta: { enabled: data.enabled },
      })

      return { updated: true }
    }),
  )

export const adminAuditFn = createServerFn({ method: 'GET' })
  .validator(z.object({ page: z.number().int().min(1).max(1000).optional() }))
  .handler(async ({ data }) =>
    asAdmin(async () => {
      const page = Math.max(1, data.page ?? 1)
      const pageSize = 30
      const [rows, totalRow] = await Promise.all([
        db
          .select({
            id: auditLogs.id,
            actorId: auditLogs.actorId,
            actorName: user.name,
            actorEmail: user.email,
            action: auditLogs.action,
            targetType: auditLogs.targetType,
            targetId: auditLogs.targetId,
            ip: auditLogs.ip,
            createdAt: auditLogs.createdAt,
          })
          .from(auditLogs)
          .leftJoin(user, eq(auditLogs.actorId, user.id))
          .orderBy(desc(auditLogs.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ value: count() }).from(auditLogs).get(),
      ])
      return {
        items: rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        })),
        total: totalRow?.value ?? 0,
        page,
      }
    }),
  )

export const adminIngestFn = createServerFn({ method: 'GET' })
  .validator(z.object({ page: z.number().int().min(1).max(1000).optional() }))
  .handler(async ({ data }) =>
    asAdmin(async () => {
      const page = Math.max(1, data.page ?? 1)
      const pageSize = 30
      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(ingestEvents)
          .orderBy(desc(ingestEvents.createdAt))
          .limit(pageSize)
          .offset((page - 1) * pageSize),
        db.select({ value: count() }).from(ingestEvents).get(),
      ])
      return {
        items: rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        })),
        total: totalRow?.value ?? 0,
        page,
      }
    }),
  )

/** An issuer is a bare origin-plus-path; a trailing slash breaks discovery. */
function normalizeIssuer(value?: string): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '')
  return trimmed ? trimmed : null
}

/**
 * A provider served from `OIDC_*` never stored a secret, so saving the rest of
 * the form without retyping it adopts the environment one. Those variables
 * describe one provider, so no other slot may inherit them.
 */
function envSecret(provider: string): string | null {
  if (provider !== ENV_OIDC_PROVIDER) return null
  const secret = process.env.OIDC_CLIENT_SECRET?.trim()
  return secret ? encryptSecret(secret) : null
}

function parseUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return url
    // Plain http is only useful against a local identity provider during
    // development; in production the client secret would cross the wire.
    if (url.protocol === 'http:' && process.env.NODE_ENV !== 'production') {
      return url
    }
    return null
  } catch {
    return null
  }
}
