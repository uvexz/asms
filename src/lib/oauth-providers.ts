import { SOCIAL_PROVIDERS } from '@/components/base/social-button/social-providers'
import type { SocialProvider } from '@/components/base/social-button/social-providers'

/**
 * Providers Better Auth implements itself — a client id and secret are all
 * they need. Everything else in `oauth_providers` is a standard OIDC provider
 * described by an issuer URL.
 */
export const BUILTIN_PROVIDERS = ['google', 'github'] as const

/** OIDC providers the admin UI can configure, in display order. */
export const OIDC_PROVIDER_IDS = ['sb', 'linuxdo'] as const
export type OidcProviderId = (typeof OIDC_PROVIDER_IDS)[number]

/**
 * The one slot the deployment-time `OIDC_*` variables fill. It predates the
 * admin UI, so those single-slot variables stay wired to this provider only —
 * every other OIDC provider is configured in the database.
 */
export const ENV_OIDC_PROVIDER: OidcProviderId = 'sb'

/** Every provider the admin UI manages. */
export const MANAGED_PROVIDERS = ['google', 'github', 'sb', 'linuxdo'] as const
export type ManagedProvider = (typeof MANAGED_PROVIDERS)[number]

const PROVIDER_LABELS: Record<string, string> = {
  sb: 'sb.sb',
  linuxdo: 'linux.do',
}

/** `email` is what lets a first sign-in create a local account at all. */
export const DEFAULT_OIDC_SCOPES = 'openid profile email offline_access'

/**
 * Issuers the provider itself fixes. Discovery hangs off this origin, so the
 * admin form arrives filled in instead of asking for a URL nobody memorises.
 */
const PROVIDER_ISSUERS: Partial<Record<string, string>> = {
  linuxdo: 'https://connect.linux.do',
}

/**
 * The scopes each provider actually publishes. linux.do lists only `openid`,
 * `profile` and `email`, and asking a strict authorization endpoint for
 * `offline_access` fails the whole round-trip.
 */
const PROVIDER_SCOPES: Partial<Record<string, string>> = {
  linuxdo: 'openid profile email',
}

export function isOidcProvider(id: string): id is OidcProviderId {
  return (OIDC_PROVIDER_IDS as readonly string[]).includes(id)
}

/** A brand we ship a glyph for, as opposed to a plain OIDC provider. */
export function isBrandProvider(id: string): id is SocialProvider {
  return id in SOCIAL_PROVIDERS
}

export function providerLabel(id: string): string {
  if (isBrandProvider(id)) return SOCIAL_PROVIDERS[id].label
  return PROVIDER_LABELS[id] ?? id
}

/** The issuer to offer when a provider has not saved one yet. */
export function providerIssuer(id: string): string | null {
  return PROVIDER_ISSUERS[id] ?? null
}

/** The scope string a provider falls back to when the column is empty. */
export function providerScopes(id: string): string {
  return PROVIDER_SCOPES[id] ?? DEFAULT_OIDC_SCOPES
}

/** OIDC discovery is always `<issuer>/.well-known/openid-configuration`. */
export function discoveryUrl(issuer: string): string {
  return `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`
}

/** The `scopes` column holds a space- or comma-separated list. */
export function parseScopes(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean)
}

/** What a provider asks for when nothing is saved for it. */
export function defaultScopes(id: string): string[] {
  return parseScopes(providerScopes(id))
}
