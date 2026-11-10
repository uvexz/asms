import { and, count, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

import { db } from '#/db'
import { domains, mailboxes } from '#/db/schema'
import { enqueueResend, getResend } from '../integrations/resend'
import { AppError, assert } from '../result'

const DOMAIN_RE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

/**
 * The dashboard tells admins to set a domain up in Resend first, so a name
 * that is already there is the normal path, not a failure — creating it again
 * would only return "domain already exists". Look it up and adopt it instead.
 */
async function findResendDomain(name: string) {
  const resend = await getResend()
  let after: string | undefined

  for (;;) {
    const result = await enqueueResend(() =>
      resend.domains.list(after ? { limit: 100, after } : { limit: 100 }),
    )
    if (result.error || !result.data) {
      throw new AppError(
        'RESEND_DOMAIN_FAILED',
        result.error?.message ?? '读取 Resend 域名列表失败',
      )
    }

    const page = result.data.data
    const match = page.find((item) => item.name.toLowerCase() === name)
    if (match) return match
    if (!result.data.has_more) return null
    after = page[page.length - 1]?.id
    if (!after) return null
  }
}

/** Full detail (DNS records included) for a domain Resend already knows. */
async function describeResendDomain(id: string) {
  const resend = await getResend()
  const result = await enqueueResend(() => resend.domains.get(id))
  if (result.error || !result.data) {
    throw new AppError(
      'RESEND_DOMAIN_FAILED',
      result.error?.message ?? '读取 Resend 域名失败',
    )
  }

  const data = result.data
  // asms routes both directions through the domain; one that was added for
  // sending only has to be widened before addresses here can receive.
  if (
    data.capabilities.sending !== 'enabled' ||
    data.capabilities.receiving !== 'enabled'
  ) {
    const updated = await enqueueResend(() =>
      resend.domains.update({
        id,
        capabilities: { sending: 'enabled', receiving: 'enabled' },
      }),
    )
    if (updated.error) {
      console.error(
        '[asms] enable resend domain capabilities failed',
        updated.error,
      )
    }
  }

  return data
}

function toRow(
  name: string,
  remote: {
    id: string
    status: string
    region?: string | null
    records?: unknown
    capabilities?: unknown
  },
) {
  return {
    id: randomUUID(),
    name,
    resendDomainId: remote.id,
    status: remote.status,
    sendingEnabled: true,
    receivingEnabled: true,
    temporaryEnabled: true,
    isDefault: false,
    region: remote.region ?? null,
    records: JSON.stringify(remote.records ?? []),
    capabilities: JSON.stringify(remote.capabilities ?? {}),
    lastCheckedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

export async function listDomains() {
  const rows = await db.select().from(domains).orderBy(desc(domains.createdAt))
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    sendingEnabled: row.sendingEnabled,
    receivingEnabled: row.receivingEnabled,
    temporaryEnabled: row.temporaryEnabled,
    isDefault: row.isDefault,
    region: row.region,
    records: row.records,
    capabilities: row.capabilities,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    resendDomainId: row.resendDomainId,
  }))
}

const PUBLIC_DOMAIN_TTL_MS = 60_000
let publicDomainCache: { names: string[]; expiresAt: number } | null = null

export function invalidatePublicDomains() {
  publicDomainCache = null
}

export async function addDomain(nameInput: string) {
  const name = nameInput.trim().toLowerCase()
  assert(DOMAIN_RE.test(name), 'INVALID_DOMAIN', '域名格式不正确')

  const existing = await db
    .select({ id: domains.id })
    .from(domains)
    .where(eq(domains.name, name))
    .get()
  assert(!existing, 'DOMAIN_EXISTS', '该域名已添加')

  const resend = await getResend()
  const created = await enqueueResend(() =>
    resend.domains.create({
      name,
      capabilities: { sending: 'enabled', receiving: 'enabled' },
    }),
  )

  let row
  let adopted = false

  if (created.error || !created.data) {
    // A failed lookup must not mask the original create error, so fall through
    // to it when listing is unavailable.
    const remote = await findResendDomain(name).catch(() => null)
    if (!remote) {
      const message = created.error?.message ?? 'Resend 创建域名失败'
      throw new AppError(
        'RESEND_DOMAIN_FAILED',
        /already exists/i.test(message)
          ? '该域名已存在于其他 Resend 团队，请换一个子域，或改用该团队的 API Key'
          : message,
      )
    }
    const detail = await describeResendDomain(remote.id)
    row = toRow(name, detail)
    adopted = true
  } else {
    row = toRow(name, created.data)
  }

  await db.insert(domains).values(row)
  invalidatePublicDomains()
  return { ...row, adopted }
}

export async function refreshDomain(id: string) {
  const row = await db.select().from(domains).where(eq(domains.id, id)).get()
  assert(row, 'DOMAIN_NOT_FOUND', '域名不存在')
  assert(row.resendDomainId, 'DOMAIN_NOT_LINKED', '该域名未关联 Resend')

  const resend = await getResend()
  const result = await enqueueResend(() =>
    resend.domains.get(row.resendDomainId!),
  )
  if (result.error || !result.data) {
    throw new AppError(
      'RESEND_DOMAIN_FAILED',
      result.error?.message ?? '读取域名状态失败',
    )
  }

  const data = result.data
  await db
    .update(domains)
    .set({
      status: data.status,
      records: JSON.stringify(data.records ?? []),
      capabilities: JSON.stringify(data.capabilities ?? {}),
      region: data.region ?? row.region,
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(domains.id, id))

  invalidatePublicDomains()
  return { status: data.status, records: data.records }
}

export async function verifyDomain(id: string) {
  const row = await db.select().from(domains).where(eq(domains.id, id)).get()
  assert(row, 'DOMAIN_NOT_FOUND', '域名不存在')
  assert(row.resendDomainId, 'DOMAIN_NOT_LINKED', '该域名未关联 Resend')

  const resend = await getResend()
  const result = await enqueueResend(() =>
    resend.domains.verify(row.resendDomainId!),
  )
  if (result.error) {
    throw new AppError(
      'RESEND_VERIFY_FAILED',
      result.error.message ?? '触发验证失败',
    )
  }

  return refreshDomain(id)
}

export async function setDefaultDomain(id: string) {
  const row = await db.select().from(domains).where(eq(domains.id, id)).get()
  assert(row, 'DOMAIN_NOT_FOUND', '域名不存在')

  await db.transaction(async (tx) => {
    await tx.update(domains).set({ isDefault: false, updatedAt: new Date() })
    await tx
      .update(domains)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(domains.id, id))
  })
  invalidatePublicDomains()
}

export async function updateDomain(
  id: string,
  patch: {
    sendingEnabled?: boolean
    receivingEnabled?: boolean
    temporaryEnabled?: boolean
  },
) {
  const row = await db.select().from(domains).where(eq(domains.id, id)).get()
  assert(row, 'DOMAIN_NOT_FOUND', '域名不存在')

  await db
    .update(domains)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(domains.id, id))
  invalidatePublicDomains()
}

export async function removeDomain(id: string) {
  const row = await db.select().from(domains).where(eq(domains.id, id)).get()
  assert(row, 'DOMAIN_NOT_FOUND', '域名不存在')

  const used = await db
    .select({ value: count() })
    .from(mailboxes)
    .where(eq(mailboxes.domainId, id))
    .get()

  assert(
    (used?.value ?? 0) === 0,
    'DOMAIN_IN_USE',
    '该域名下仍有邮箱，无法删除',
  )

  if (row.resendDomainId) {
    try {
      const resend = await getResend()
      await enqueueResend(() => resend.domains.remove(row.resendDomainId!))
    } catch (error) {
      console.error('[asms] remove resend domain failed', error)
    }
  }

  await db.delete(domains).where(eq(domains.id, id))
  invalidatePublicDomains()
}

/**
 * Names only, and only the ones that can actually receive. This is what the
 * landing page is allowed to publish about a domain — nothing else is.
 */
export async function publicDomainNames(limit = 4) {
  if (
    limit <= 4 &&
    publicDomainCache &&
    publicDomainCache.expiresAt > Date.now()
  ) {
    return publicDomainCache.names.slice(0, limit)
  }

  const queryLimit = Math.max(limit, 4)
  const rows = await db
    .select({ name: domains.name })
    .from(domains)
    .where(
      and(eq(domains.status, 'verified'), eq(domains.receivingEnabled, true)),
    )
    .orderBy(desc(domains.isDefault), domains.name)
    .limit(queryLimit)

  const names = rows.map((row) => row.name)
  if (limit <= 4) {
    publicDomainCache = {
      names: names.slice(0, 4),
      expiresAt: Date.now() + PUBLIC_DOMAIN_TTL_MS,
    }
  }
  return names.slice(0, limit)
}
