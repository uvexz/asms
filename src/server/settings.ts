import { z } from 'zod'

import { db } from '#/db'
import { settings } from '#/db/schema'
import { EMAIL_PATTERN } from '#/lib/email'
import { decryptSecret, encryptSecret, maskSecret } from './crypto'

/**
 * Role addresses a personal mailbox may never claim: RFC 2142 requires the
 * first group to stay reachable, the second is what a stranger guesses when
 * they need the organisation, and the rest are emitted by mail software or
 * reserved for protocol endpoints. Matching ignores case and `._-`, so
 * `No_Reply` collides with `noreply` as well.
 */
const DEFAULT_RESERVED = [
  // RFC 2142
  'postmaster',
  'abuse',
  'hostmaster',
  'webmaster',
  'security',
  'noc',
  // 职能信箱
  'admin',
  'administrator',
  'sysadmin',
  'root',
  'system',
  'operator',
  'info',
  'contact',
  'support',
  'help',
  'helpdesk',
  'billing',
  'payments',
  'invoice',
  'accounts',
  'finance',
  'legal',
  'privacy',
  'dpo',
  'compliance',
  'feedback',
  'press',
  'marketing',
  'sales',
  'jobs',
  'hr',
  // 机器信箱
  'noreply',
  'donotreply',
  'bounce',
  'bounces',
  'mailer-daemon',
  'mailer',
  'postfix',
  'mail',
  'email',
  'notifications',
  'notify',
  'alerts',
  'newsletter',
  'subscribe',
  'unsubscribe',
  // 协议与服务端点
  'smtp',
  'imap',
  'pop3',
  'webmail',
  'autodiscover',
  'autoconfig',
  'caldav',
  'carddav',
  'ns',
  'ns1',
  'ns2',
  'dns',
  'dmarc',
  'dkim',
  'spf',
  'api',
  'www',
  'cdn',
  'static',
  'status',
]

export const SETTING_DEFS = {
  'site.name': {
    group: 'site',
    schema: z.string().trim().min(1).max(80).default('asms'),
  },
  'site.description': {
    group: 'site',
    schema: z.string().trim().max(200).default('自托管邮件服务'),
  },
  'site.logoUrl': {
    group: 'site',
    schema: z.string().trim().max(500).default(''),
  },
  'site.footerText': {
    group: 'site',
    schema: z.string().trim().max(300).default(''),
  },
  'site.timezone': {
    group: 'site',
    schema: z.string().trim().default('Asia/Shanghai'),
  },
  'site.registrationEnabled': {
    group: 'site',
    schema: z.boolean().default(true),
  },

  'auth.emailPasswordEnabled': {
    group: 'auth',
    schema: z.boolean().default(true),
  },

  'mail.maxPermanentMailboxes': {
    group: 'mail',
    schema: z.number().int().min(0).max(1000).default(5),
  },
  'mail.dailySendLimit': {
    group: 'mail',
    schema: z.number().int().min(0).max(100000).default(5),
  },
  'mail.permanentCooldownDays': {
    group: 'mail',
    schema: z.number().int().min(0).max(3650).default(30),
  },
  'mail.retentionDays': {
    group: 'mail',
    schema: z.number().int().min(1).max(3650).default(30),
  },
  'mail.minPrefixPermanent': {
    group: 'mail',
    schema: z.number().int().min(1).max(64).default(3),
  },
  'mail.minPrefixTemp': {
    group: 'mail',
    schema: z.number().int().min(1).max(64).default(8),
  },
  'mail.maxPrefixLength': {
    group: 'mail',
    schema: z.number().int().min(1).max(64).default(32),
  },
  'mail.reservedPrefixes': {
    group: 'mail',
    schema: z.array(z.string()).default(DEFAULT_RESERVED),
  },
  'mail.allowTempSending': {
    group: 'mail',
    schema: z.boolean().default(false),
  },

  'resend.apiKey': {
    group: 'resend',
    secret: true,
    schema: z.string().default(''),
  },
  'resend.webhookSecret': {
    group: 'resend',
    secret: true,
    schema: z.string().default(''),
  },
  'resend.fromName': {
    group: 'resend',
    schema: z.string().trim().max(80).default('asms'),
  },
  'resend.systemFromAddress': {
    group: 'resend',
    schema: z.string().trim().max(200).default(''),
  },

  'storage.s3.endpoint': {
    group: 'storage',
    schema: z.string().trim().max(500).default(''),
  },
  'storage.s3.region': {
    group: 'storage',
    schema: z.string().trim().max(80).default('auto'),
  },
  'storage.s3.bucket': {
    group: 'storage',
    schema: z.string().trim().max(120).default(''),
  },
  'storage.s3.accessKeyId': {
    group: 'storage',
    secret: true,
    schema: z.string().default(''),
  },
  'storage.s3.secretAccessKey': {
    group: 'storage',
    secret: true,
    schema: z.string().default(''),
  },
  'storage.s3.forcePathStyle': {
    group: 'storage',
    schema: z.boolean().default(true),
  },
} as const

export type SettingKey = keyof typeof SETTING_DEFS
export type SettingValue<TKey extends SettingKey> = z.infer<
  (typeof SETTING_DEFS)[TKey]['schema']
>

type SettingRow = typeof settings.$inferSelect

/**
 * One snapshot of the `settings` table plus the values already parsed out of
 * it. The table is tiny but the reads are not free: a secret costs an AES-GCM
 * decrypt and every value costs a JSON parse and a zod parse, and `getSiteConfig`
 * alone reads nine of them on the path that builds the auth instance. Parsed
 * values therefore live beside the rows they came from — a new snapshot cannot
 * inherit a value from the old one, so invalidation has nothing extra to clear.
 */
type SettingsSnapshot = {
  rows: Map<string, SettingRow>
  values: Map<string, unknown>
  expiresAt: number
}

let snapshot: SettingsSnapshot | null = null
let inflight: {
  generation: number
  promise: Promise<SettingsSnapshot>
} | null = null
let generation = 0

const CACHE_TTL_MS = 15_000
const warnedSettingErrors = new Set<string>()

/** A corrupt security gate must not fall back to a permissive default. */
const FAIL_CLOSED: Partial<Record<SettingKey, unknown>> = {
  'site.registrationEnabled': false,
  'mail.allowTempSending': false,
  'auth.emailPasswordEnabled': false,
}

function clearInflight(target: {
  generation: number
  promise: Promise<SettingsSnapshot>
}) {
  if (inflight === target) inflight = null
}

async function loadSnapshot(): Promise<SettingsSnapshot> {
  if (snapshot && snapshot.expiresAt > Date.now()) return snapshot
  // A read that started before the last write must not satisfy a read that
  // started after it, or the caller sees values it has just overwritten.
  if (inflight && inflight.generation === generation) return inflight.promise

  const startGeneration = generation
  const promise = (async () => {
    const rows = await db.select().from(settings)
    const next: SettingsSnapshot = {
      rows: new Map(rows.map((row) => [row.key, row])),
      values: new Map(),
      expiresAt: Date.now() + CACHE_TTL_MS,
    }
    // A write may have landed while this read was in flight; do not repopulate
    // the cache with rows that predate the invalidation.
    if (startGeneration === generation) snapshot = next
    return next
  })()

  const entry = { generation: startGeneration, promise }
  inflight = entry
  void promise.then(
    () => clearInflight(entry),
    () => clearInflight(entry),
  )
  return promise
}

export function invalidateSettings() {
  generation += 1
  snapshot = null
  mailPolicyState.lease = null
  siteConfigState.lease = null
}

export async function getSetting<TKey extends SettingKey>(
  key: TKey,
): Promise<SettingValue<TKey>> {
  const def = SETTING_DEFS[key]
  const current = await loadSnapshot()

  if (current.values.has(key)) {
    return current.values.get(key) as SettingValue<TKey>
  }

  const row = current.rows.get(key)

  let raw: unknown
  let corrupt = false
  if (row) {
    try {
      const text = row.isSecret ? decryptSecret(row.value) : row.value
      raw = text ? JSON.parse(text) : undefined
    } catch (error) {
      corrupt = true
      if (!warnedSettingErrors.has(key)) {
        warnedSettingErrors.add(key)
        console.error(`[asms] failed to read setting ${key}`, error)
      }
      raw = undefined
    }
  }

  const value = (
    corrupt && key in FAIL_CLOSED
      ? def.schema.parse(FAIL_CLOSED[key])
      : def.schema.parse(raw)
  ) as SettingValue<TKey>

  current.values.set(key, value)
  return value
}

type SettingsWriter = Pick<typeof db, 'insert'>

export async function setSetting<TKey extends SettingKey>(
  key: TKey,
  value: unknown,
  actorId?: string,
  writer: SettingsWriter = db,
): Promise<SettingValue<TKey>> {
  const def = SETTING_DEFS[key]
  const parsed = def.schema.parse(value)
  const serialized = JSON.stringify(parsed)
  const stored =
    'secret' in def && def.secret ? encryptSecret(serialized) : serialized
  const isSecret = 'secret' in def && Boolean(def.secret)

  await writer
    .insert(settings)
    .values({
      key,
      value: stored,
      isSecret,
      updatedBy: actorId ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value: stored,
        isSecret,
        updatedBy: actorId ?? null,
        updatedAt: new Date(),
      },
    })

  invalidateSettings()
  return parsed as SettingValue<TKey>
}

export type SettingJsonValue = string | number | boolean | string[] | null

export type AdminSettingRow = {
  key: SettingKey
  group: string
  value: SettingJsonValue
  isSecret: boolean
  hasValue: boolean
  preview: string
  updatedAt: string | null
}

export async function getAdminSettings(): Promise<AdminSettingRow[]> {
  const current = await loadSnapshot()
  const rows = current.rows
  return (Object.keys(SETTING_DEFS) as SettingKey[]).map((key) => {
    const def = SETTING_DEFS[key]
    const row = rows.get(key)
    const isSecret = 'secret' in def && Boolean(def.secret)

    let value = def.schema.parse(undefined) as SettingJsonValue
    let preview = String(value ?? '')
    let hasValue = false

    if (isSecret) {
      value = null
      preview = ''
    }

    if (row) {
      hasValue = row.value.length > 0
      try {
        const text = row.isSecret ? decryptSecret(row.value) : row.value
        value = (text ? JSON.parse(text) : null) as SettingJsonValue
        if (isSecret) {
          preview = maskSecret(String(value ?? ''))
          value = null
        } else {
          preview = String(value ?? '')
        }
      } catch (error) {
        hasValue = false
        value = def.schema.parse(
          key in FAIL_CLOSED ? FAIL_CLOSED[key] : undefined,
        )
        if (!isSecret) preview = String(value ?? '')
        if (!warnedSettingErrors.has(key)) {
          warnedSettingErrors.add(key)
          console.error(`[asms] failed to read setting ${key}`, error)
        }
      }
    }

    return {
      key,
      group: def.group,
      value,
      isSecret,
      hasValue,
      preview,
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    }
  })
}

async function buildMailPolicy() {
  const [
    maxPermanentMailboxes,
    dailySendLimit,
    permanentCooldownDays,
    retentionDays,
    minPrefixPermanent,
    minPrefixTemp,
    maxPrefixLength,
    reservedPrefixes,
    allowTempSending,
  ] = await Promise.all([
    getSetting('mail.maxPermanentMailboxes'),
    getSetting('mail.dailySendLimit'),
    getSetting('mail.permanentCooldownDays'),
    getSetting('mail.retentionDays'),
    getSetting('mail.minPrefixPermanent'),
    getSetting('mail.minPrefixTemp'),
    getSetting('mail.maxPrefixLength'),
    getSetting('mail.reservedPrefixes'),
    getSetting('mail.allowTempSending'),
  ])

  return {
    maxPermanentMailboxes,
    dailySendLimit,
    permanentCooldownDays,
    retentionDays,
    minPrefixPermanent,
    minPrefixTemp,
    maxPrefixLength,
    reservedPrefixes,
    allowTempSending,
  }
}

type MailPolicy = Awaited<ReturnType<typeof buildMailPolicy>>

/**
 * A derived view of the settings — the mail policy, the site config — is
 * rebuilt from several settings at once, so it needs its own lease. `generation`
 * on the lease is what stops a build that started before a write from being
 * published after it: the write bumped the generation and the lease is refused.
 */
type DerivedState<T> = {
  lease: { value: T; expiresAt: number; generation: number } | null
  inflight: Promise<T> | null
}

function forgetWhenSettled<T>(state: DerivedState<T>, promise: Promise<T>) {
  const clear = () => {
    if (state.inflight === promise) state.inflight = null
  }
  void promise.then(clear, clear)
}

/**
 * Serves a derived view from its lease, or rebuilds it. The in-flight promise
 * is shared so a cold cache under concurrent requests runs one build instead of
 * one per request.
 */
async function readDerived<T>(
  state: DerivedState<T>,
  build: () => Promise<T>,
): Promise<T> {
  const lease = state.lease
  if (
    lease &&
    lease.generation === generation &&
    lease.expiresAt > Date.now()
  ) {
    return lease.value
  }
  if (state.inflight) return state.inflight

  const startGeneration = generation
  const promise = build().then((value) => {
    if (startGeneration === generation) {
      state.lease = {
        value,
        expiresAt: Date.now() + CACHE_TTL_MS,
        generation: startGeneration,
      }
    }
    return value
  })

  state.inflight = promise
  forgetWhenSettled(state, promise)
  return promise
}

const mailPolicyState: DerivedState<MailPolicy> = {
  lease: null,
  inflight: null,
}

export async function getMailPolicy(): Promise<MailPolicy> {
  return readDerived(mailPolicyState, buildMailPolicy)
}

async function buildSiteConfig() {
  const [
    siteName,
    siteDescription,
    logoUrl,
    footerText,
    timezone,
    registrationEnabled,
    emailPasswordEnabled,
    resendApiKey,
    systemFromAddress,
  ] = await Promise.all([
    getSetting('site.name'),
    getSetting('site.description'),
    getSetting('site.logoUrl'),
    getSetting('site.footerText'),
    getSetting('site.timezone'),
    getSetting('site.registrationEnabled'),
    getSetting('auth.emailPasswordEnabled'),
    getSetting('resend.apiKey'),
    getSetting('resend.systemFromAddress'),
  ])

  // Verification is only usable when a mail can actually leave the site: a
  // key without a sender would leave every new account locked at a page that
  // cannot send the link.
  const emailVerificationRequired = Boolean(
    (resendApiKey || process.env.RESEND_API_KEY?.trim()) &&
    EMAIL_PATTERN.test(systemFromAddress),
  )

  return {
    siteName,
    siteDescription,
    logoUrl,
    footerText,
    timezone,
    registrationEnabled,
    emailPasswordEnabled,
    emailVerificationRequired,
  }
}

type SiteConfig = Awaited<ReturnType<typeof buildSiteConfig>>

const siteConfigState: DerivedState<SiteConfig> = {
  lease: null,
  inflight: null,
}

export async function getSiteConfig(): Promise<SiteConfig> {
  return readDerived(siteConfigState, buildSiteConfig)
}
