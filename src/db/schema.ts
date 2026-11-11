import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

const createdAt = () =>
  integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)

const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)

/* ------------------------------------------------------------------ */
/* Better Auth tables (email/password + admin plugin)                  */
/* ------------------------------------------------------------------ */

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' })
    .notNull()
    .default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  role: text('role').notNull().default('user'),
  banned: integer('banned', { mode: 'boolean' }).notNull().default(false),
  banReason: text('ban_reason'),
  banExpires: integer('ban_expires', { mode: 'timestamp' }),
})

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text('impersonated_by'),
  },
  (t) => [index('session_user_idx').on(t.userId)],
)

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', {
      mode: 'timestamp',
    }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', {
      mode: 'timestamp',
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('account_user_idx').on(t.userId),
    index('account_provider_idx').on(t.providerId, t.accountId),
  ],
)

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

/* ------------------------------------------------------------------ */
/* Domains                                                             */
/* ------------------------------------------------------------------ */

export const domains = sqliteTable(
  'domains',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull().unique(),
    resendDomainId: text('resend_domain_id'),
    status: text('status').notNull().default('pending'),
    sendingEnabled: integer('sending_enabled', { mode: 'boolean' })
      .notNull()
      .default(true),
    receivingEnabled: integer('receiving_enabled', { mode: 'boolean' })
      .notNull()
      .default(true),
    /** Whether users may open temporary mailboxes on this domain. */
    temporaryEnabled: integer('temporary_enabled', { mode: 'boolean' })
      .notNull()
      .default(true),
    isDefault: integer('is_default', { mode: 'boolean' })
      .notNull()
      .default(false),
    region: text('region'),
    records: text('records_json'),
    capabilities: text('capabilities_json'),
    lastCheckedAt: integer('last_checked_at', { mode: 'timestamp' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('domains_default_uq')
      .on(t.isDefault)
      .where(sql`${t.isDefault} = 1`),
  ],
)

/* ------------------------------------------------------------------ */
/* Mailboxes                                                           */
/* ------------------------------------------------------------------ */

export const mailboxes = sqliteTable(
  'mailboxes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    localPart: text('local_part').notNull(),
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull().default('permanent'),
    displayName: text('display_name'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    renewCount: integer('renew_count').notNull().default(0),
    status: text('status').notNull().default('active'),
    lastReceivedAt: integer('last_received_at', { mode: 'timestamp' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('mailboxes_address_uq').on(t.domainId, t.localPart),
    index('mailboxes_user_kind_idx').on(t.userId, t.kind),
    index('mailboxes_user_created_idx').on(t.userId, t.createdAt),
    index('mailboxes_expiry_idx').on(t.kind, t.expiresAt),
  ],
)

/**
 * Released permanent addresses stay unavailable for a cooldown window so a
 * new user cannot inherit mail addressed to the previous owner.
 */
export const addressReleases = sqliteTable(
  'address_releases',
  {
    domainId: text('domain_id')
      .notNull()
      .references(() => domains.id, { onDelete: 'cascade' }),
    localPart: text('local_part').notNull(),
    releasedAt: integer('released_at', { mode: 'timestamp' }).notNull(),
    availableAt: integer('available_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.domainId, t.localPart] })],
)

/* ------------------------------------------------------------------ */
/* Inbound messages                                                    */
/* ------------------------------------------------------------------ */

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    mailboxId: text('mailbox_id')
      .notNull()
      .references(() => mailboxes.id, { onDelete: 'cascade' }),
    resendEmailId: text('resend_email_id').notNull(),
    fromAddress: text('from_address').notNull(),
    fromName: text('from_name'),
    toJson: text('to_json').notNull().default('[]'),
    ccJson: text('cc_json').notNull().default('[]'),
    bccJson: text('bcc_json').notNull().default('[]'),
    replyToJson: text('reply_to_json').notNull().default('[]'),
    subject: text('subject').notNull().default(''),
    snippet: text('snippet').notNull().default(''),
    textBody: text('text_body'),
    htmlBody: text('html_body'),
    headersJson: text('headers_json'),
    sizeBytes: integer('size_bytes').notNull().default(0),
    hasAttachments: integer('has_attachments', { mode: 'boolean' })
      .notNull()
      .default(false),
    isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
    isStarred: integer('is_starred', { mode: 'boolean' })
      .notNull()
      .default(false),
    receivedAt: integer('received_at', { mode: 'timestamp' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('messages_resend_mailbox_uq').on(t.resendEmailId, t.mailboxId),
    index('messages_mailbox_time_idx').on(t.mailboxId, t.receivedAt),
    index('messages_received_idx').on(t.receivedAt),
    index('messages_unread_idx')
      .on(t.mailboxId)
      .where(sql`${t.isRead} = 0`),
  ],
)

export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    resendAttachmentId: text('resend_attachment_id'),
    filename: text('filename').notNull(),
    contentType: text('content_type')
      .notNull()
      .default('application/octet-stream'),
    size: integer('size').notNull().default(0),
    storageKey: text('storage_key'),
    stored: integer('stored', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('attachments_message_idx').on(t.messageId)],
)

/* ------------------------------------------------------------------ */
/* Outbound mail                                                       */
/* ------------------------------------------------------------------ */

export const sentEmails = sqliteTable(
  'sent_emails',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    mailboxId: text('mailbox_id')
      .notNull()
      .references(() => mailboxes.id, { onDelete: 'cascade' }),
    resendEmailId: text('resend_email_id'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    fromAddress: text('from_address').notNull(),
    toJson: text('to_json').notNull().default('[]'),
    ccJson: text('cc_json').notNull().default('[]'),
    bccJson: text('bcc_json').notNull().default('[]'),
    subject: text('subject').notNull().default(''),
    textBody: text('text_body').notNull().default(''),
    htmlBody: text('html_body').notNull().default(''),
    status: text('status').notNull().default('queued'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    createdAt: createdAt(),
    sentAt: integer('sent_at', { mode: 'timestamp' }),
    lastEventAt: integer('last_event_at', { mode: 'timestamp' }),
  },
  (t) => [
    index('sent_user_time_idx').on(t.userId, t.createdAt),
    index('sent_resend_idx').on(t.resendEmailId),
    index('sent_created_idx').on(t.createdAt),
  ],
)

export const sendQuota = sqliteTable(
  'send_quota',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    quotaDate: text('quota_date').notNull(),
    used: integer('used').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.quotaDate] })],
)

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  isSecret: integer('is_secret', { mode: 'boolean' }).notNull().default(false),
  updatedAt: updatedAt(),
  updatedBy: text('updated_by'),
})

export const oauthProviders = sqliteTable('oauth_providers', {
  provider: text('provider').primaryKey(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  clientId: text('client_id'),
  clientSecretEnc: text('client_secret_enc'),
  /** OIDC issuer, e.g. `https://sb.sb/oidc`. Built-in providers leave it null. */
  issuer: text('issuer'),
  scopes: text('scopes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

/* ------------------------------------------------------------------ */
/* Observability                                                       */
/* ------------------------------------------------------------------ */

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    metaJson: text('meta_json'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_time_idx').on(t.createdAt)],
)

export const ingestEvents = sqliteTable(
  'ingest_events',
  {
    id: text('id').primaryKey(),
    resendEmailId: text('resend_email_id'),
    recipientsJson: text('recipients_json').notNull().default('[]'),
    result: text('result').notNull(),
    detail: text('detail'),
    mailboxId: text('mailbox_id'),
    createdAt: createdAt(),
  },
  (t) => [index('ingest_time_idx').on(t.createdAt)],
)

/* ------------------------------------------------------------------ */
/* Telegram bot                                                        */
/* ------------------------------------------------------------------ */

export const telegramLinks = sqliteTable('telegram_links', {
  telegramUserId: text('telegram_user_id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  telegramUsername: text('telegram_username'),
  telegramFirstName: text('telegram_first_name'),
  linkedAt: integer('linked_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
})

export const telegramLinkTokens = sqliteTable(
  'telegram_link_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: createdAt(),
    usedAt: integer('used_at', { mode: 'timestamp' }),
  },
  (t) => [index('telegram_link_tokens_user_idx').on(t.userId)],
)

export const telegramSessions = sqliteTable('telegram_sessions', {
  telegramUserId: text('telegram_user_id').primaryKey(),
  chatId: text('chat_id').notNull(),
  activeMessageId: integer('active_message_id'),
  stateJson: text('state_json').notNull(),
  version: integer('version').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const telegramUpdates = sqliteTable(
  'telegram_updates',
  {
    updateId: integer('update_id').primaryKey(),
    status: text('status').notNull().default('processing'),
    claimedAt: integer('claimed_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('telegram_updates_claimed_idx').on(t.claimedAt)],
)
