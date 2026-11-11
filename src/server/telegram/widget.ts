import { deflateSync } from 'node:zlib'

let cached: string | null = null

/**
 * Sends only a valid widget. This runs at send time rather than module load so
 * a broken widget cannot take the whole web app down.
 */
export function assertWidgetHtml(html: string): void {
  if (cached === html) return
  const bytes = Buffer.byteLength(html, 'utf8')
  if (bytes > 32_768) {
    throw new Error(
      `[asms] Telegram widget HTML is ${bytes} bytes (limit 32768)`,
    )
  }
  if (html.includes('\0')) {
    throw new Error('[asms] Telegram widget HTML contains NUL')
  }
  const compressed = deflateSync(Buffer.from(html, 'utf8'), {
    level: 9,
  }).length
  if (compressed > 4_096) {
    throw new Error(
      `[asms] Telegram widget HTML compresses to ${compressed} bytes (limit 4096)`,
    )
  }
  cached = html
}
