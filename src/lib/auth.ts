import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin, genericOAuth } from 'better-auth/plugins'
import type { GenericOAuthConfig } from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { count } from 'drizzle-orm'

import { db } from '#/db'
import * as schema from '#/db/schema'
import {
  BUILTIN_PROVIDERS,
  DEFAULT_OIDC_SCOPES,
  defaultScopes,
  discoveryUrl,
  ENV_OIDC_PROVIDER,
  OIDC_PROVIDER_IDS,
  parseScopes,
} from '#/lib/oauth-providers'
import { decryptSecret } from '#/server/crypto'
import { assertRuntimeEnv } from '#/server/env'
import { configuredIpHeaders, configuredTrustedProxies } from '#/server/ip'
import { sendSystemMail } from '#/server/services/system-mail'
import { getSetting } from '#/server/settings'

type ProviderRow = typeof schema.oauthProviders.$inferSelect
type SocialProviders = Record<
  string,
  { clientId: string; clientSecret: string }
>

type Providers = {
  /** Providers Better Auth knows natively (Google, GitHub). */
  social: SocialProviders
  /** Standard OIDC providers, resolved from their issuer. */
  oidc: GenericOAuthConfig[]
  /** Every provider a visitor can sign in with, in configuration order. */
  ids: string[]
}

const warnedSecrets = new Set<string>()

function secretOf(row: ProviderRow | undefined): string | null {
  if (!row?.clientSecretEnc) return null
  try {
    return decryptSecret(row.clientSecretEnc)
  } catch (error) {
    // A rotated encryption key should not take the whole auth endpoint down,
    // but silently dropping the provider makes the login screen lie about
    // which methods are usable. Log it once per provider instead.
    if (!warnedSecrets.has(row.provider)) {
      warnedSecrets.add(row.provider)
      console.error(
        `[asms] failed to decrypt OAuth client secret for ${row.provider}`,
        error,
      )
    }
    return null
  }
}

/**
 * linux.do answers `/api/user` with `avatar_url`, and leaves `name` empty for
 * members who never set a display name — `username` is then the only thing
 * worth showing. Both are OIDC fields under different names, so the rest of
 * the profile needs no special handling.
 */
function linuxDoProfile(profile: Record<string, unknown>) {
  // Empty strings count as missing: linux.do sends `name: ""` for members
  // who never set one, and `username` is then what should show.
  const name = profile.name || profile.username || profile.login
  const image = profile.avatar_url || profile.picture
  return {
    name: typeof name === 'string' ? name : undefined,
    image: typeof image === 'string' ? image : undefined,
  }
}

function fromRow(
  provider: string,
  row: ProviderRow,
): GenericOAuthConfig | null {
  const clientSecret = secretOf(row)
  // A provider without a decryptable secret cannot complete the token
  // exchange. Treating it as configured both shows a broken login button and
  // lets an admin disable password login while no provider actually works.
  if (!row.enabled || !row.clientId || !row.issuer || !clientSecret) return null
  const scopes = parseScopes(row.scopes)
  return {
    providerId: provider,
    clientId: row.clientId,
    clientSecret,
    discoveryUrl: discoveryUrl(row.issuer),
    scopes: scopes.length > 0 ? scopes : defaultScopes(provider),
    pkce: true,
    // Better Auth turns sign-out into an RP-initiated logout as soon as an
    // issuer publishes `end_session_endpoint`: it answers with a provider URL
    // and the client navigates there, abandoning `/login`. We send no
    // `post_logout_redirect_uri`, so the provider has nowhere to send the user
    // back and they are stranded on the identity provider. Signing out here
    // means signing out of this site.
    disableProviderLogout: true,
    ...(provider === 'linuxdo' ? { mapProfileToUser: linuxDoProfile } : {}),
  }
}

/**
 * `OIDC_*` is the deployment-time form of the same configuration, used only
 * while no row has been saved for its provider. Saving the provider in the
 * admin UI — including switching it off — takes precedence from then on.
 */
function fromEnv(): GenericOAuthConfig | null {
  const issuer = process.env.OIDC_ISSUER?.trim()
  const clientId = process.env.OIDC_CLIENT_ID?.trim()
  if (!issuer || !clientId) return null
  return {
    providerId: ENV_OIDC_PROVIDER,
    clientId,
    clientSecret: process.env.OIDC_CLIENT_SECRET?.trim() || undefined,
    discoveryUrl: discoveryUrl(issuer),
    redirectURI: process.env.OIDC_REDIRECT_URI?.trim() || undefined,
    scopes: parseScopes(process.env.OIDC_SCOPES ?? DEFAULT_OIDC_SCOPES),
    pkce: true,
    disableProviderLogout: true,
  }
}

async function readProviders(): Promise<Providers> {
  const rows = await db.select().from(schema.oauthProviders)
  const byId = new Map(rows.map((row) => [row.provider, row]))

  const social: SocialProviders = {}
  for (const provider of BUILTIN_PROVIDERS) {
    const row = byId.get(provider)
    const clientSecret = secretOf(row)
    if (!row?.enabled || !row.clientId || !clientSecret) continue
    social[provider] = { clientId: row.clientId, clientSecret }
  }

  const oidc: GenericOAuthConfig[] = []
  for (const provider of OIDC_PROVIDER_IDS) {
    const row = byId.get(provider)
    // The environment block is single-slot: it describes `sb`, never every
    // OIDC provider the app happens to know about.
    const config = row
      ? fromRow(provider, row)
      : provider === ENV_OIDC_PROVIDER
        ? fromEnv()
        : null
    if (config) oidc.push(config)
  }

  return {
    social,
    oidc,
    ids: [...Object.keys(social), ...oidc.map((config) => config.providerId)],
  }
}

function createAuth(
  providers: Providers,
  emailPasswordEnabled: boolean,
  appName: string,
) {
  const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
  const ipAddressHeaders = configuredIpHeaders()
  const trustedProxies = configuredTrustedProxies()

  return betterAuth({
    appName,
    baseURL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema,
    }),
    trustedOrigins: [baseURL],
    advanced: {
      ipAddress: {
        ipAddressHeaders,
        ...(trustedProxies.length > 0 ? { trustedProxies } : {}),
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // Sensitive operations (unlink account, delete account) require a session
      // created within a day. Treating a month-old session as fresh removed
      // that re-authentication step entirely.
      freshAge: 60 * 60 * 24,
      // Every server function resolves the session; without this each
      // navigation and query reads the session table again. The short lease
      // also bounds how long a banned or demoted user stays stale.
      cookieCache: { enabled: true, maxAge: 30 },
    },
    rateLimit: {
      enabled: true,
      window: 10,
      max: 100,
    },
    account: {
      accountLinking: {
        enabled: true,
        // Implicit linking is the account pre-hijacking path: someone who
        // registers a victim's unverified address would receive the victim's
        // first OAuth sign-in. Linking stays available as an explicit action
        // in settings, where the signed-in user proves ownership.
        disableImplicitLinking: true,
        requireLocalEmailVerified: true,
        // A linked account is chosen deliberately by a signed-in user; its
        // address does not have to match the login address.
        allowDifferentEmails: true,
        trustedProviders: providers.ids,
      },
    },
    emailAndPassword: {
      enabled: emailPasswordEnabled,
      requireEmailVerification: false,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await sendSystemMail({
          to: user.email,
          subject: '重置你的密码',
          text: `请打开以下链接重置密码（1 小时内有效）：\n${url}`,
          html: `<p>请打开以下链接重置密码（1 小时内有效）：</p><p><a href="${url}">${url}</a></p>`,
        })
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async () => {
            const enabled = await getSetting('site.registrationEnabled')
            if (enabled) return
            const total =
              (await db.select({ value: count() }).from(schema.user).get())
                ?.value ?? 0
            if (total > 0) {
              throw new APIError('FORBIDDEN', {
                message: '站点已关闭注册',
              })
            }
          },
        },
      },
    },
    socialProviders: providers.social,
    plugins: [
      ...(providers.oidc.length > 0
        ? [genericOAuth({ config: providers.oidc })]
        : []),
      admin(),
      tanstackStartCookies(),
    ],
  })
}

type AuthInstance = ReturnType<typeof createAuth>

let cached: { key: string; auth: AuthInstance } | null = null

/**
 * `getAuth()` runs on every server function — `getSession` needs it, and every
 * read goes through `getSession`. Without this, one page that reads four
 * resources re-reads `oauth_providers` four times. The rows only change from
 * the admin UI in this process, and every writer calls `resetAuthCache`, so a
 * short lease is enough; it also bounds how stale another instance's write can
 * look here.
 */
const PROVIDER_TTL_MS = 15_000
let providerCache: { providers: Providers; expiresAt: number } | null = null

async function loadProviders(): Promise<Providers> {
  if (providerCache && providerCache.expiresAt > Date.now()) {
    return providerCache.providers
  }

  const providers = await readProviders()
  providerCache = { providers, expiresAt: Date.now() + PROVIDER_TTL_MS }
  return providers
}

/**
 * The OAuth client id/secret live in the database, so the auth instance is
 * rebuilt whenever that configuration changes (checked per request, cached).
 */
export async function getAuth(): Promise<AuthInstance> {
  assertRuntimeEnv()
  const [providers, enabled, appName] = await Promise.all([
    loadProviders(),
    getSetting('auth.emailPasswordEnabled'),
    getSetting('site.name'),
  ])
  const key = JSON.stringify({ providers, enabled, appName })

  const next =
    cached && cached.key === key
      ? cached
      : { key, auth: createAuth(providers, enabled, appName) }

  cached = next
  return next.auth
}

/** Provider ids a visitor can pick on the login screen. */
export async function getEnabledProviderIds(): Promise<string[]> {
  return (await loadProviders()).ids
}

export function resetAuthCache() {
  cached = null
  providerCache = null
}
