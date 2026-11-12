import { and, count, desc, eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

import { db } from '#/db'
import {
  addressReleases,
  attachments,
  domains,
  mailboxes,
  messages,
} from '#/db/schema'
import { TEMP_MAILBOX_TTL_MINUTES } from '#/lib/temp-mailbox'
import { deleteObjects } from '../integrations/storage'
import { RATE_LIMITS, enforceRateLimit } from '../rate-limit'
import { AppError, assert } from '../result'
import { getMailPolicy } from '../settings'

type MailboxRow = typeof mailboxes.$inferSelect

/** Display names go into an RFC 5322 `From` header, so control characters and
 * delimiters have to be removed before they reach Resend. */
export function sanitizeDisplayName(value: string | null | undefined): string {
  return [...(value ?? '')]
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0
      return code >= 32 && code !== 127
    })
    .join('')
    .replace(/["<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export type MailboxDto = {
  id: string
  address: string
  localPart: string
  domain: string
  domainId: string
  kind: 'permanent' | 'temporary'
  displayName: string | null
  status: string
  expiresAt: string | null
  lastReceivedAt: string | null
  unread: number
  createdAt: string
}

export function formatAddress(localPart: string, domain: string) {
  return `${localPart}@${domain}`
}

export function splitAddress(
  address: string,
): { localPart: string; domain: string } | null {
  const at = address.lastIndexOf('@')
  if (at <= 0 || at === address.length - 1) return null
  return {
    localPart: address.slice(0, at).trim().toLowerCase(),
    domain: address
      .slice(at + 1)
      .trim()
      .toLowerCase(),
  }
}

/** Strips plus-addressing so `hi+tag@example.com` routes to `hi@example.com`. */
export function stripPlusTag(localPart: string) {
  return localPart.split('+')[0] ?? localPart
}

export function serializeMailbox(
  row: MailboxRow,
  domainName: string,
  unread = 0,
): MailboxDto {
  return {
    id: row.id,
    address: formatAddress(row.localPart, domainName),
    localPart: row.localPart,
    domain: domainName,
    domainId: row.domainId,
    kind: row.kind === 'temporary' ? 'temporary' : 'permanent',
    displayName: row.displayName,
    status: row.status,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    lastReceivedAt: row.lastReceivedAt
      ? row.lastReceivedAt.toISOString()
      : null,
    unread,
    createdAt: row.createdAt.toISOString(),
  }
}

/** A temporary mailbox that received mail while it was valid is kept until
 * the user deletes it; an untouched one expires at `expiresAt`. */
export function isExpired(row: {
  kind: string
  expiresAt: Date | null
  lastReceivedAt: Date | null
}) {
  return (
    row.kind === 'temporary' &&
    !row.lastReceivedAt &&
    (!row.expiresAt || row.expiresAt.getTime() <= Date.now())
  )
}

/**
 * The same rule as `isExpired`, spelled for the database so a read can drop
 * dead temporary mailboxes before they reach the process. Both spellings live
 * here on purpose: this is the only place that decides what "gone" means, and
 * a JS copy elsewhere would be free to drift. Reads on the `mailboxes` table
 * may use it directly — it names the table's own columns.
 */
export function liveMailboxCondition(now: Date) {
  const at = Math.floor(now.getTime() / 1000)
  return sql`not (${mailboxes.kind} = 'temporary' and ${mailboxes.lastReceivedAt} is null and (${mailboxes.expiresAt} is null or ${mailboxes.expiresAt} <= ${at}))`
}

/** Reserved words ignore case and `._-`, so `no.reply` cannot slip past `noreply`. */
function isReserved(localPart: string, reserved: string[]) {
  const target = localPart.replace(/[^a-z0-9]/g, '')
  return reserved.some((word) => word.replace(/[^a-z0-9]/g, '') === target)
}

function validateLocalPart(
  localPart: string,
  kind: 'permanent' | 'temporary',
  policy: Awaited<ReturnType<typeof getMailPolicy>>,
) {
  const min =
    kind === 'permanent' ? policy.minPrefixPermanent : policy.minPrefixTemp

  assert(
    /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(localPart),
    'PREFIX_INVALID',
    '前缀只能包含小写字母、数字、点、下划线和连字符，且需以字母或数字开头结尾',
  )
  assert(!localPart.includes('..'), 'PREFIX_INVALID', '前缀不能包含连续的点')
  // Reserved wins over the length rules: `billing` is a reserved word in every
  // kind, and saying so is more useful than pointing at the minimum length.
  assert(
    !isReserved(localPart, policy.reservedPrefixes),
    'PREFIX_RESERVED',
    '该前缀为系统保留字，请更换',
  )
  assert(localPart.length >= min, 'PREFIX_TOO_SHORT', `前缀至少 ${min} 位`)
  assert(
    localPart.length <= policy.maxPrefixLength,
    'PREFIX_TOO_LONG',
    `前缀最多 ${policy.maxPrefixLength} 位`,
  )
}

async function findAvailableDomain(
  kind: 'permanent' | 'temporary',
  domainId?: string,
) {
  // A domain can be reserved for long-lived addresses; temporary mailboxes
  // must then fall through to another one instead of landing there anyway.
  const tempOnly =
    kind === 'temporary' ? [eq(domains.temporaryEnabled, true)] : []

  if (domainId) {
    const domain = await db
      .select()
      .from(domains)
      .where(eq(domains.id, domainId))
      .get()
    assert(domain, 'DOMAIN_NOT_FOUND', '域名不存在')
    assert(domain.status === 'verified', 'DOMAIN_NOT_VERIFIED', '域名尚未验证')
    assert(domain.receivingEnabled, 'DOMAIN_DISABLED', '该域名未开启收件')
    assert(
      kind !== 'temporary' || domain.temporaryEnabled,
      'DOMAIN_TEMP_DISABLED',
      '该域名未开启临时邮箱',
    )
    return domain
  }

  const domain = await db
    .select()
    .from(domains)
    .where(
      and(
        eq(domains.status, 'verified'),
        eq(domains.receivingEnabled, true),
        eq(domains.isDefault, true),
        ...tempOnly,
      ),
    )
    .get()

  if (domain) return domain

  const fallback = await db
    .select()
    .from(domains)
    .where(
      and(
        eq(domains.status, 'verified'),
        eq(domains.receivingEnabled, true),
        ...tempOnly,
      ),
    )
    .orderBy(desc(domains.createdAt))
    .get()

  assert(
    fallback,
    'NO_DOMAIN',
    kind === 'temporary' ? '管理员未开放临时邮箱' : '管理员尚未配置可用域名',
  )
  return fallback
}

export async function listMailboxes(userId: string): Promise<MailboxDto[]> {
  // The unread badge is a correlated count, not a second round trip: the
  // partial index on unread messages serves it as a covering scan, so one
  // statement answers the whole rail.
  const rows = await db
    .select({
      mailbox: mailboxes,
      domainName: domains.name,
      unread: sql<number>`(
        select count(*) from ${messages}
        where ${messages.mailboxId} = ${mailboxes.id}
          and ${messages.isRead} = 0
      )`,
    })
    .from(mailboxes)
    .innerJoin(domains, eq(mailboxes.domainId, domains.id))
    .where(
      and(
        eq(mailboxes.userId, userId),
        eq(mailboxes.status, 'active'),
        liveMailboxCondition(new Date()),
      ),
    )
    .orderBy(desc(mailboxes.createdAt))

  return rows.map((row) =>
    serializeMailbox(row.mailbox, row.domainName, row.unread ?? 0),
  )
}

export async function countPermanent(userId: string): Promise<number> {
  const row = await db
    .select({ value: count() })
    .from(mailboxes)
    .where(
      and(
        eq(mailboxes.userId, userId),
        eq(mailboxes.kind, 'permanent'),
        eq(mailboxes.status, 'active'),
      ),
    )
    .get()
  return row?.value ?? 0
}

export async function createMailbox(input: {
  userId: string
  role: string
  localPart: string
  domainId?: string
  kind: 'permanent' | 'temporary'
  displayName?: string
}): Promise<MailboxDto> {
  const policy = await getMailPolicy()
  const localPart = input.localPart.trim().toLowerCase()
  validateLocalPart(localPart, input.kind, policy)

  await enforceRateLimit(
    input.kind === 'temporary'
      ? RATE_LIMITS.tempMailboxCreate
      : RATE_LIMITS.permanentMailboxCreate,
    input.userId,
  )

  const domain = await findAvailableDomain(input.kind, input.domainId)
  const isAdmin = input.role === 'admin'

  if (!isAdmin && input.kind === 'permanent') {
    const used = await countPermanent(input.userId)
    assert(
      used < policy.maxPermanentMailboxes,
      'MAILBOX_LIMIT_REACHED',
      `长期邮箱数量已达上限（${policy.maxPermanentMailboxes} 个）`,
    )
  }

  const existing = await db
    .select({ id: mailboxes.id, kind: mailboxes.kind })
    .from(mailboxes)
    .where(
      and(
        eq(mailboxes.domainId, domain.id),
        eq(mailboxes.localPart, localPart),
      ),
    )
    .get()

  if (existing) {
    assert(existing.kind === 'temporary', 'ADDRESS_TAKEN', '该地址已被占用')
    // An expired temporary mailbox releases its address lazily.
    const row = await db
      .select()
      .from(mailboxes)
      .where(eq(mailboxes.id, existing.id))
      .get()
    if (row && !isExpired(row)) {
      throw new AppError('ADDRESS_TAKEN', '该地址已被占用')
    }
    if (row) {
      await deleteMailboxStorage(row.id)
      await db.delete(mailboxes).where(eq(mailboxes.id, row.id))
    }
  }

  if (input.kind === 'permanent') {
    const release = await db
      .select()
      .from(addressReleases)
      .where(
        and(
          eq(addressReleases.domainId, domain.id),
          eq(addressReleases.localPart, localPart),
        ),
      )
      .get()
    if (release && release.availableAt.getTime() > Date.now()) {
      throw new AppError(
        'ADDRESS_COOLDOWN',
        `该地址刚被释放，${policy.permanentCooldownDays} 天内不可重新创建`,
      )
    }
  }

  const now = new Date()
  const expiresAt =
    input.kind === 'temporary'
      ? new Date(now.getTime() + TEMP_MAILBOX_TTL_MINUTES * 60_000)
      : null

  const row: MailboxRow = {
    id: randomUUID(),
    userId: input.userId,
    localPart,
    domainId: domain.id,
    kind: input.kind,
    displayName: sanitizeDisplayName(input.displayName) || null,
    expiresAt,
    status: 'active',
    lastReceivedAt: null,
    createdAt: now,
    updatedAt: now,
  }

  await db
    .insert(mailboxes)
    .values(row)
    .catch((error) => {
      if (
        String(error instanceof Error ? error.message : error).includes(
          'UNIQUE',
        )
      ) {
        throw new AppError('ADDRESS_TAKEN', '该地址已被占用')
      }
      throw error
    })
  return serializeMailbox(row, domain.name)
}

async function mailboxStorageKeys(mailboxId: string): Promise<string[]> {
  const rows = await db
    .select({ storageKey: attachments.storageKey })
    .from(attachments)
    .innerJoin(messages, eq(attachments.messageId, messages.id))
    .where(eq(messages.mailboxId, mailboxId))

  return rows
    .map((row) => row.storageKey)
    .filter((key): key is string => Boolean(key))
}

/** Removes stored attachment objects for a mailbox before its rows cascade. */
export async function deleteMailboxStorage(mailboxId: string) {
  await deleteObjects(await mailboxStorageKeys(mailboxId))
}

export async function getMailboxForUser(
  userId: string,
  mailboxId: string,
): Promise<{ mailbox: MailboxDto; row: MailboxRow }> {
  const result = await db
    .select({ mailbox: mailboxes, domainName: domains.name })
    .from(mailboxes)
    .innerJoin(domains, eq(mailboxes.domainId, domains.id))
    .where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.userId, userId)))
    .get()

  assert(result, 'MAILBOX_NOT_FOUND', '邮箱不存在')
  assert(!isExpired(result.mailbox), 'MAILBOX_EXPIRED', '临时邮箱已过期')
  assert(result.mailbox.status === 'active', 'MAILBOX_DISABLED', '邮箱已停用')

  return {
    mailbox: serializeMailbox(result.mailbox, result.domainName),
    row: result.mailbox,
  }
}

async function removeMailboxRow(row: MailboxRow): Promise<void> {
  const policy = await getMailPolicy()

  if (row.kind === 'permanent' && policy.permanentCooldownDays > 0) {
    const now = Date.now()
    const availableAt = new Date(
      now + policy.permanentCooldownDays * 24 * 60 * 60 * 1000,
    )
    await db
      .insert(addressReleases)
      .values({
        domainId: row.domainId,
        localPart: row.localPart,
        releasedAt: new Date(now),
        availableAt,
      })
      .onConflictDoUpdate({
        target: [addressReleases.domainId, addressReleases.localPart],
        set: { releasedAt: new Date(now), availableAt },
      })
  }

  await deleteMailboxStorage(row.id)
  await db.delete(mailboxes).where(eq(mailboxes.id, row.id))
}

export async function deleteMailbox(
  userId: string,
  mailboxId: string,
): Promise<void> {
  await enforceRateLimit(RATE_LIMITS.mailboxDelete, userId)
  const { row } = await getMailboxForUser(userId, mailboxId)
  await removeMailboxRow(row)
}

/** The admin path keeps the same release/storage rules as the owner path. */
export async function deleteMailboxAsAdmin(
  mailboxId: string,
): Promise<MailboxRow> {
  const row = await db
    .select()
    .from(mailboxes)
    .where(eq(mailboxes.id, mailboxId))
    .get()
  assert(row, 'MAILBOX_NOT_FOUND', '邮箱不存在')
  await removeMailboxRow(row)
  return row
}

export async function findMailboxByAddress(
  localPart: string,
  domainName: string,
): Promise<MailboxRow | null> {
  const row = await db
    .select({ mailbox: mailboxes })
    .from(mailboxes)
    .innerJoin(domains, eq(mailboxes.domainId, domains.id))
    .where(
      and(
        eq(domains.name, domainName),
        eq(domains.receivingEnabled, true),
        eq(mailboxes.localPart, localPart),
      ),
    )
    .get()

  return row?.mailbox ?? null
}

export async function domainsForUser() {
  return db
    .select({
      id: domains.id,
      name: domains.name,
      isDefault: domains.isDefault,
      temporaryEnabled: domains.temporaryEnabled,
    })
    .from(domains)
    .where(
      and(eq(domains.status, 'verified'), eq(domains.receivingEnabled, true)),
    )
    .orderBy(desc(domains.isDefault), domains.name)
}
