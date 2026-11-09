import { z } from 'zod'

import { db } from '#/db'
import { settings } from '#/db/schema'
import { decryptSecret, encryptSecret, maskSecret } from './crypto'

const DEFAULT_RESERVED = [
  'admin',
  'administrator',
  'postmaster',
  'hostmaster',
  'webmaster',
  'abuse',
  'root',
  'security',
  'support',
  'system',
  'mailer-daemon',
  'no-reply',
  'noreply',
  'bounce',
  'bounces',
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
  'mail.tempTtlMinutes': {
    group: 'mail',
    schema: z.number().int().min(5).max(1440).default(60),
  },
  'mail.tempMaxLifetimeMinutes': {
    group: 'mail',
    schema: z.number().int().min(5).max(10080).default(1440),
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

let cache: { rows: Map<string, SettingRow>; expiresAt: number } | null = null
let inflight: Promise<Map<string, SettingRow>> | null = null

const CACHE_TTL_MS = 15_000

async function loadRows(): Promise<Map<string, SettingRow>> {
  if (cache && cache.expiresAt > Date.now()) return cache.rows
  if (inflight) return inflight

  inflight = (async () => {
    const rows = await db.select().from(settings)
    const map = new Map(rows.map((row) => [row.key, row]))
    cache = { rows: map, expiresAt: Date.now() + CACHE_TTL_MS }
    return map
  })().finally(() => {
    inflight = null
  })

  return inflight
}

export function invalidateSettings() {
  cache = null
}

export async function getSetting<TKey extends SettingKey>(
  key: TKey,
): Promise<SettingValue<TKey>> {
  const def = SETTING_DEFS[key]
  const row = (await loadRows()).get(key)

  let raw: unknown
  if (row) {
    try {
      const text = row.isSecret ? decryptSecret(row.value) : row.value
      raw = text ? JSON.parse(text) : undefined
    } catch {
      raw = undefined
    }
  }

  return def.schema.parse(raw) as SettingValue<TKey>
}

export async function setSetting<TKey extends SettingKey>(
  key: TKey,
  value: unknown,
  actorId?: string,
): Promise<SettingValue<TKey>> {
  const def = SETTING_DEFS[key]
  const parsed = def.schema.parse(value)
  const serialized = JSON.stringify(parsed)
  const stored =
    'secret' in def && def.secret ? encryptSecret(serialized) : serialized
  const isSecret = 'secret' in def && Boolean(def.secret)

  await db
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
  const rows = await loadRows()
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
      } catch {
        hasValue = false
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

export async function getMailPolicy() {
  const [
    maxPermanentMailboxes,
    dailySendLimit,
    tempTtlMinutes,
    tempMaxLifetimeMinutes,
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
    getSetting('mail.tempTtlMinutes'),
    getSetting('mail.tempMaxLifetimeMinutes'),
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
    tempTtlMinutes,
    tempMaxLifetimeMinutes,
    permanentCooldownDays,
    retentionDays,
    minPrefixPermanent,
    minPrefixTemp,
    maxPrefixLength,
    reservedPrefixes,
    allowTempSending,
  }
}

export async function getSiteConfig() {
  const [
    siteName,
    siteDescription,
    logoUrl,
    footerText,
    timezone,
    registrationEnabled,
    emailPasswordEnabled,
  ] = await Promise.all([
    getSetting('site.name'),
    getSetting('site.description'),
    getSetting('site.logoUrl'),
    getSetting('site.footerText'),
    getSetting('site.timezone'),
    getSetting('site.registrationEnabled'),
    getSetting('auth.emailPasswordEnabled'),
  ])

  return {
    siteName,
    siteDescription,
    logoUrl,
    footerText,
    timezone,
    registrationEnabled,
    emailPasswordEnabled,
  }
}
