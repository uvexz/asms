import { isIP } from 'node:net'

const DEFAULT_IP_HEADERS = ['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for']

/**
 * The headers a deployment's proxy actually overwrites. Trusting all of them
 * blindly on a directly exposed server lets a caller forge an address, so a
 * deployment that does not sit behind one of these proxies should set
 * `IP_ADDRESS_HEADERS` to the single header it controls.
 */
export function configuredIpHeaders(): string[] {
  const raw = process.env.IP_ADDRESS_HEADERS
  if (!raw) return DEFAULT_IP_HEADERS
  const headers = raw
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  return headers.length > 0 ? headers : DEFAULT_IP_HEADERS
}

/** CIDR list of proxies whose rightmost `x-forwarded-for` hops are trusted. */
export function configuredTrustedProxies(): string[] {
  return (process.env.TRUSTED_PROXIES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

export function clientIpFromHeaders(headers: Headers): string | null {
  for (const header of configuredIpHeaders()) {
    const raw = headers.get(header)
    if (!raw) continue
    const candidate =
      header === 'x-forwarded-for' ? raw.split(',')[0]?.trim() : raw.trim()
    if (candidate && isIP(candidate) !== 0) return candidate
  }
  return null
}
