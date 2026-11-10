let checked = false

/**
 * Fail closed before the first request instead of serving a production build
 * with development secrets or a localhost auth URL. Called from the start
 * entry so builds and local development are unaffected.
 */
export function assertRuntimeEnv() {
  if (checked) return
  if (process.env.NODE_ENV !== 'production') {
    checked = true
    return
  }

  const missing = [
    'BETTER_AUTH_URL',
    'BETTER_AUTH_SECRET',
    'ASMS_ENCRYPTION_KEY',
  ].filter((key) => !process.env[key]?.trim())
  if (missing.length > 0) {
    throw new Error(
      `[asms] missing required environment variables: ${missing.join(', ')}`,
    )
  }

  let url: URL
  try {
    url = new URL(process.env.BETTER_AUTH_URL!)
  } catch {
    throw new Error('[asms] BETTER_AUTH_URL must be a valid absolute URL')
  }
  if (url.protocol !== 'https:') {
    throw new Error('[asms] BETTER_AUTH_URL must use https in production')
  }

  if (!process.env.CRON_SECRET?.trim()) {
    console.warn(
      '[asms] CRON_SECRET is not set; /api/cron/cleanup will reject all requests',
    )
  }

  checked = true
}
