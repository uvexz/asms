/**
 * Formatters are built once and reused. Constructing one costs roughly sixty
 * times more than formatting with it, and these run for every row of a list
 * that repaints on each poll.
 *
 * The zone is the site's, not the browser's. `site.timezone` is an admin
 * setting that also drives the "resets at 00:00" copy and the retention job,
 * so a user in another zone must still read the same clock the server uses.
 * The root route hands it over before the first render (see `__root.tsx`), on
 * both the server and the client, so the two renders agree on every string.
 */
let defaultTimeZone: string | undefined

/**
 * Called from the root route's `beforeLoad`. An administrator can type any
 * string into the setting, and `Intl` throws on an unknown zone, so an invalid
 * value falls back to the browser's zone instead of taking the page down.
 */
export function setDefaultTimeZone(timeZone: string | undefined) {
  defaultTimeZone = timeZone?.trim() || undefined
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(
  kind: 'short' | 'full',
  timeZone: string | undefined,
): Intl.DateTimeFormat {
  const key = `${kind}:${timeZone ?? ''}`
  const cached = formatters.get(key)
  if (cached) return cached

  const options: Intl.DateTimeFormatOptions =
    kind === 'short'
      ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
      : {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }

  let next: Intl.DateTimeFormat
  try {
    next = new Intl.DateTimeFormat('zh-CN', { ...options, timeZone })
  } catch {
    next = new Intl.DateTimeFormat('zh-CN', options)
  }

  formatters.set(key, next)
  return next
}

function formatDateTime(value: string | Date, timeZone?: string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return formatterFor('short', timeZone ?? defaultTimeZone).format(date)
}

export function formatFullDateTime(
  value: string | Date,
  timeZone?: string,
): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return formatterFor('full', timeZone ?? defaultTimeZone).format(date)
}

export function formatRelative(
  value: string | Date,
  timeZone?: string,
): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const diff = Date.now() - date.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  return formatDateTime(date, timeZone)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`
}

export function countdown(expiresAt: string | null): string {
  if (!expiresAt) return ''
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return '已过期'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return '即将过期'
  if (minutes < 60) return `${minutes} 分钟后过期`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} 小时后过期` : `${hours} 小时 ${rest} 分钟后过期`
}
