import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'

const PREFIX = 'v1'
const DEV_FALLBACK = 'asms-development-key'

let currentKeyCache: Buffer | null = null
let previousKeysCache: Buffer[] | null = null
let warnedAboutFallback = false

function deriveKey(raw: string): Buffer {
  const decoded = Buffer.from(raw, 'base64')
  if (decoded.length === 32) return decoded
  return createHash('sha256').update(raw).digest()
}

function currentKey(): Buffer {
  if (currentKeyCache) return currentKeyCache

  const dedicated = process.env.ASMS_ENCRYPTION_KEY?.trim()
  if (dedicated) {
    currentKeyCache = deriveKey(dedicated)
    return currentKeyCache
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('[asms] ASMS_ENCRYPTION_KEY is required in production')
  }

  if (!warnedAboutFallback) {
    warnedAboutFallback = true
    console.warn(
      '[asms] ASMS_ENCRYPTION_KEY is not set; using a development secret. ' +
        'Secrets encrypted this way will not survive a BETTER_AUTH_SECRET rotation.',
    )
  }
  currentKeyCache = deriveKey(
    process.env.BETTER_AUTH_SECRET?.trim() || DEV_FALLBACK,
  )
  return currentKeyCache
}

/** Rotation helper: old keys can still decrypt, new writes use the current key. */
function previousKeys(): Buffer[] {
  if (previousKeysCache) return previousKeysCache
  previousKeysCache = (process.env.ASMS_ENCRYPTION_KEY_PREVIOUS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map(deriveKey)
  return previousKeysCache
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext>, all base64url. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', currentKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    enc.toString('base64url'),
  ].join('.')
}

export function decryptSecret(payload: string): string {
  const [version, ivPart, tagPart, dataPart] = payload.split('.')
  if (version !== PREFIX || !ivPart || !tagPart || !dataPart) {
    throw new Error('Unsupported secret payload')
  }

  let lastError: unknown
  for (const key of [currentKey(), ...previousKeys()]) {
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(ivPart, 'base64url'),
      )
      decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
      const dec = Buffer.concat([
        decipher.update(Buffer.from(dataPart, 'base64url')),
        decipher.final(),
      ])
      return dec.toString('utf8')
    } catch (error) {
      lastError = error
    }
  }

  throw new Error('Unable to decrypt secret', { cause: lastError })
}

export function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 8) return '••••••••'
  return `${value.slice(0, 4)}••••${value.slice(-4)}`
}
