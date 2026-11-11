import { createHash, randomBytes } from 'node:crypto'

export const LINK_TOKEN_TTL_MS = 10 * 60_000

export function createLinkToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString('base64url')
  return { token, hash: hashLinkToken(token) }
}

export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function isLinkToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(value)
}
