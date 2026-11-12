/**
 * Formatters are built once and reused. Constructing one costs roughly sixty
 * times more than formatting with it, and these run for every row of a list
 * that repaints on each poll.
 */
let shortDateTime: Intl.DateTimeFormat | undefined
let fullDateTime: Intl.DateTimeFormat | undefined

function shortDateTimeFormatter() {
  return (shortDateTime ??= new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }))
}

function fullDateTimeFormatter() {
  return (fullDateTime ??= new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }))
}

function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return shortDateTimeFormatter().format(date)
}

export function formatFullDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return fullDateTimeFormatter().format(date)
}

export function formatRelative(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const diff = Date.now() - date.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  return formatDateTime(date)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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
