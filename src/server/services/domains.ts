import { and, count, desc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

import { db } from '#/db'
import { domains, mailboxes } from '#/db/schema'
import { enqueueResend, getResend } from '../integrations/resend'
import { AppError, assert } from '../result'

const DOMAIN_RE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

export async function listDomains() {
  const rows = await db.select().from(domains).orderBy(desc(domains.createdAt))
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    sendingEnabled: row.sendingEnabled,
    receivingEnabled: row.receivingEnabled,
    isDefault: row.isDefault,
    region: row.region,
    records: row.records,
    capabilities: row.capabilities,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    resendDomainId: row.resendDomainId,
  }))
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
  const result = await enqueueResend(() =>
    resend.domains.create({
      name,
      capabilities: { sending: 'enabled', receiving: 'enabled' },
    }),
  )
  if (result.error || !result.data) {
    throw new AppError(
      'RESEND_DOMAIN_FAILED',
      result.error?.message ?? 'Resend 创建域名失败',
    )
  }

  const created = result.data
  const row = {
    id: randomUUID(),
    name,
    resendDomainId: created.id,
    status: created.status,
    sendingEnabled: true,
    receivingEnabled: true,
    isDefault: false,
    region: created.region ?? null,
    records: JSON.stringify(created.records ?? []),
    capabilities: JSON.stringify(created.capabilities ?? {}),
    lastCheckedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  await db.insert(domains).values(row)
  return row
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
}

export async function updateDomain(
  id: string,
  patch: { sendingEnabled?: boolean; receivingEnabled?: boolean },
) {
  const row = await db.select().from(domains).where(eq(domains.id, id)).get()
  assert(row, 'DOMAIN_NOT_FOUND', '域名不存在')

  await db
    .update(domains)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(domains.id, id))
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
}

export async function countDomains() {
  const row = await db
    .select({ value: count() })
    .from(domains)
    .where(and(eq(domains.status, 'verified')))
    .get()
  return row?.value ?? 0
}
